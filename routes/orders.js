const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAdmin, requireCustomer } = require('../middleware/auth');
const mailer = require('../utils/mailer');
const fieldCrypto = require('../utils/crypto');
const { isBundle } = require('../utils/bundles');

const router = express.Router();
const VALID_STATUSES = ['New', 'Confirmed', 'Preparing', 'Shipped', 'Delivered', 'Cancelled'];

function decryptOrder(o) {
  return {
    ...o,
    name: fieldCrypto.decrypt(o.name),
    phone: fieldCrypto.decrypt(o.phone),
    address: fieldCrypto.decrypt(o.address),
    email: fieldCrypto.decrypt(o.email) // only present on orders made before phone-only accounts
  };
}

// Generous for a real shopper (a family could place a few orders), tight enough
// to block a bot script from flooding fake orders that deplete your stock.
const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: { error: 'Too many orders from this connection. Please try again later or contact us directly.' },
  standardHeaders: true,
  legacyHeaders: false
});

function deliveryFeeFor(settings, city, subtotal) {
  if (subtotal >= settings.freeDeliveryThreshold) return 0;
  return settings.cityFees[city] ?? settings.deliveryDefault;
}

// ---------- CUSTOMER ----------
// POST /api/orders  { name, phone, city, address, items:[{productId, qty}] }
router.post('/', orderLimiter, requireCustomer, (req, res) => {
  const data = db.read();
  const { name, phone, city, address, items } = req.body || {};

  // customerId always comes from the signed-in session — never from the request body
  const customer = data.customers.find(c => c.id === req.session.customerId);
  if (!customer) return res.status(401).json({ error: 'Please sign in again.' });

  if (!name || !phone || !city || !address || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required order fields' });
  }
  if (String(name).length > 100 || String(phone).length > 30 || String(city).length > 50 || String(address).length > 400) {
    return res.status(400).json({ error: 'One of the fields is too long. Please shorten it.' });
  }
  if (items.length > 50) {
    return res.status(400).json({ error: 'Too many items in one order' });
  }

  const byId = new Map(data.products.map(p => [p.id, p]));

  // Work out how many of each individual perfume this order uses. A gift-set bundle
  // uses the perfumes inside it, so the totals are added up across the WHOLE order —
  // otherwise one perfume could be sold twice (once alone, once inside a set).
  const need = new Map();
  const addNeed = (id, units) => need.set(id, (need.get(id) || 0) + units);
  const lines = [];
  let subtotal = 0;

  for (const line of items) {
    const product = byId.get(line && line.productId);
    if (!product || !product.active) {
      return res.status(400).json({ error: 'One of the items in your bag is no longer available' });
    }
    const qty = Math.min(50, Math.max(1, parseInt(line.qty, 10) || 1));
    if (isBundle(product)) {
      for (const b of product.bundle) addNeed(b.productId, b.qty * qty);
    } else {
      addNeed(product.id, qty);
    }
    subtotal += product.price * qty;
    lines.push({ product, qty });
  }

  for (const { product, qty } of lines) {
    const parts = isBundle(product) ? product.bundle.map(b => b.productId) : [product.id];
    for (const id of parts) {
      const part = byId.get(id);
      if (!part || part.stock < need.get(id)) {
        return res.status(400).json({ error: `Sorry, "${product.name}" is no longer available in that quantity` });
      }
    }
  }

  const lineItems = lines.map(({ product, qty }) => {
    const item = { productId: product.id, name: product.name, price: product.price, qty };
    if (isBundle(product)) {
      item.bundle = product.bundle.map(b => ({ productId: b.productId, name: byId.get(b.productId).name, qty: b.qty }));
    }
    return item;
  });

  for (const [id, units] of need) byId.get(id).stock -= units;

  const deliveryFee = deliveryFeeFor(data.settings, city, subtotal);
  const order = {
    id: db.id('ord'),
    customerId: customer.id,
    name, phone, city, address,
    items: lineItems,
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    status: 'New',
    paymentMethod: 'Cash on Delivery',
    createdAt: new Date().toISOString()
  };

  const storedOrder = {
    ...order,
    name: fieldCrypto.encrypt(order.name),
    phone: fieldCrypto.encrypt(order.phone),
    address: fieldCrypto.encrypt(order.address)
  };
  data.orders.unshift(storedOrder);
  db.write(data);

  // Optional email alert to you (only if SELLER_EMAIL is set up); never blocks or fails the order.
  mailer.sendNewOrderAlertToSeller(order);

  res.status(201).json({ ok: true, orderId: order.id, total: order.total });
});

// ---------- ADMIN ----------
router.get('/admin/all', requireAdmin, (req, res) => {
  const data = db.read();
  res.json(data.orders.map(decryptOrder));
});

// How many of each individual perfume an order holds (looking inside gift sets).
function orderUnits(order) {
  const units = new Map();
  const add = (id, n) => { if (id) units.set(id, (units.get(id) || 0) + n); };
  for (const item of order.items || []) {
    if (Array.isArray(item.bundle)) {
      for (const b of item.bundle) add(b.productId, b.qty * item.qty);
    } else {
      add(item.productId, item.qty);
    }
  }
  return units;
}

router.put('/admin/:id/status', requireAdmin, (req, res) => {
  const data = db.read();
  const order = data.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const byId = new Map(data.products.map(p => [p.id, p]));
  const units = orderUnits(order);

  if (status === 'Cancelled' && order.status !== 'Cancelled') {
    // A cancelled order puts its perfumes back in stock.
    for (const [id, n] of units) { const p = byId.get(id); if (p) p.stock += n; }
  } else if (order.status === 'Cancelled' && status !== 'Cancelled') {
    // Re-opening a cancelled order takes the stock out again — if there's still enough.
    for (const [id, n] of units) {
      const p = byId.get(id);
      if (p && p.stock < n) {
        return res.status(409).json({ error: `Not enough stock of "${p.name}" to re-open this order.` });
      }
    }
    for (const [id, n] of units) { const p = byId.get(id); if (p) p.stock -= n; }
  }

  order.status = status;
  db.write(data);
  res.json(decryptOrder(order));
});

module.exports = router;

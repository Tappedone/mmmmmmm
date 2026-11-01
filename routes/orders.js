const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const mailer = require('../utils/mailer');
const fieldCrypto = require('../utils/crypto');
const { isBundle } = require('../utils/bundles');
const { normalizePhone } = require('../utils/phone');

const router = express.Router();
const VALID_STATUSES = ['New', 'Confirmed', 'Preparing', 'Shipped', 'Delivered', 'Cancelled'];

function decryptOrder(o) {
  const { phoneKey, ...rest } = o; // the internal phone fingerprint is never sent to the browser
  return {
    ...rest,
    name: fieldCrypto.decrypt(o.name),
    phone: fieldCrypto.decrypt(o.phone),
    address: fieldCrypto.decrypt(o.address),
    email: fieldCrypto.decrypt(o.email) // only present on orders made before phone-only accounts
  };
}

// Orders are placed without an account, so abuse protection matters. Three layers:
//  1. per connection — generous, because many phones on one mobile network can share one address;
//  2. per phone number — a real customer doesn't order more than a few times a day;
//  3. a hidden form field that only bots fill in.
// You also confirm every order with the customer on WhatsApp before it ships, and cancelling an order
// puts its stock back, so a fake order costs you a message, not money.
const MAX_ORDERS_PER_PHONE_PER_DAY = 5;
const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  message: { error: 'Too many orders from this connection. Please try again later or message us on WhatsApp.' },
  standardHeaders: true,
  legacyHeaders: false
});

function deliveryFeeFor(settings, city, subtotal) {
  if (subtotal >= settings.freeDeliveryThreshold) return 0;
  return settings.cityFees[city] ?? settings.deliveryDefault;
}

// ---------- CHECKOUT (no account needed) ----------
// POST /api/orders  { name, phone, city, address, items:[{productId, qty}] }
router.post('/', orderLimiter, (req, res) => {
  const body = req.body || {};

  // Hidden trap field: people never see it, bots fill it. Pretend it worked so they don't adapt.
  if (body.hp_check) return res.status(201).json({ ok: true, orderId: db.id('ord'), total: 0 });

  const data = db.read();
  const { city, address, items } = body;
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();

  if (!name || !phone || !city || !address || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Please fill in your name, phone number, city and address' });
  }
  if (name.length > 100 || phone.length > 30 || String(city).length > 50 || String(address).length > 400) {
    return res.status(400).json({ error: 'One of the fields is too long. Please shorten it.' });
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return res.status(400).json({ error: 'Please enter a valid phone number — we contact you on it to confirm delivery.' });
  }
  if (items.length > 50) {
    return res.status(400).json({ error: 'Too many items in one order' });
  }

  // Same phone number, too many orders today (cancelled ones don't count)
  const phoneKeys = new Set([fieldCrypto.blindIndex(normalizedPhone), fieldCrypto.plainIndex(normalizedPhone)]);
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const recent = data.orders.filter(o => o.phoneKey && phoneKeys.has(o.phoneKey) && o.status !== 'Cancelled' && Date.parse(o.createdAt) > since).length;
  if (recent >= MAX_ORDERS_PER_PHONE_PER_DAY) {
    return res.status(429).json({ error: 'There have already been several orders from this phone number today. Please message us on WhatsApp.' });
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
    name, phone, city: String(city), address: String(address),
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
    address: fieldCrypto.encrypt(order.address),
    phoneKey: fieldCrypto.blindIndex(normalizedPhone) // lets us count orders per phone without storing it readably
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

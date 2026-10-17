const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAdmin, requireCustomer } = require('../middleware/auth');
const mailer = require('../utils/mailer');

const router = express.Router();
const VALID_STATUSES = ['New', 'Confirmed', 'Preparing', 'Shipped', 'Delivered', 'Cancelled'];

// Generous for a real shopper (a family could place a few orders), tight enough
// to block a bot script from flooding fake orders that deplete your stock and
// spam your inbox with "new order" emails.
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

// ---------- PUBLIC ----------
// POST /api/orders  { name, phone, city, address, items:[{productId, qty}] }
router.post('/', orderLimiter, requireCustomer, async (req, res) => {
  const data = db.read();
  const { name, phone, city, address, items, email } = req.body || {};

  // customerId always comes from the authenticated session now — never from the request body
  const customer = data.customers.find(c => c.id === req.session.customerId);
  if (!customer) return res.status(401).json({ error: 'Please sign in again.' });

  if (!name || !phone || !city || !address || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required order fields' });
  }
  if (name.length > 100 || phone.length > 30 || city.length > 50 || address.length > 400) {
    return res.status(400).json({ error: 'One of the fields is too long. Please shorten it.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (items.length > 50) {
    return res.status(400).json({ error: 'Too many items in one order' });
  }

  let subtotal = 0;
  const lineItems = [];
  for (const line of items) {
    const product = data.products.find(p => p.id === line.productId && p.active);
    if (!product) return res.status(400).json({ error: `Product ${line.productId} not found` });
    const qty = Math.max(1, parseInt(line.qty, 10) || 1);
    if (product.stock < qty) {
      return res.status(400).json({ error: `Not enough stock for ${product.name}` });
    }
    subtotal += product.price * qty;
    lineItems.push({ productId: product.id, name: product.name, price: product.price, qty });
  }

  const deliveryFee = deliveryFeeFor(data.settings, city, subtotal);

  // decrement stock
  for (const line of lineItems) {
    const p = data.products.find(x => x.id === line.productId);
    p.stock -= line.qty;
  }

  const order = {
    id: db.id('ord'),
    customerId: customer.id,
    name, phone, city, address,
    email: email || customer.email,
    items: lineItems,
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    status: 'New',
    paymentMethod: 'Cash on Delivery',
    createdAt: new Date().toISOString()
  };
  data.orders.unshift(order);
  db.write(data);

  // Email notifications never block or fail the order itself.
  mailer.sendOrderConfirmation(order);
  mailer.sendNewOrderAlertToSeller(order);

  res.status(201).json({ ok: true, orderId: order.id, total: order.total });
});

// ---------- ADMIN ----------
router.get('/admin/all', requireAdmin, (req, res) => {
  const data = db.read();
  res.json(data.orders);
});

router.put('/admin/:id/status', requireAdmin, (req, res) => {
  const data = db.read();
  const order = data.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  order.status = status;
  db.write(data);
  mailer.sendOrderStatusUpdate(order);
  res.json(order);
});

module.exports = router;

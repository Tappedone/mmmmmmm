const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireCustomer } = require('../middleware/auth');
const mailer = require('../utils/mailer');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false
});

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

function publicCustomer(c) {
  return { id: c.id, name: c.name, email: c.email, phone: c.phone };
}

router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const data = db.read();
  const existing = data.customers.find(c => c.email.toLowerCase() === email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });

  const customer = {
    id: db.id('cust'),
    name, email: email.toLowerCase(), phone: phone || '',
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString()
  };
  data.customers.push(customer);
  db.write(data);

  req.session.customerId = customer.id;
  mailer.sendWelcomeEmail(customer); // fire and forget; failures are logged, not fatal

  res.status(201).json({ ok: true, customer: publicCustomer(customer) });
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const data = db.read();
  const customer = data.customers.find(c => c.email.toLowerCase() === (email || '').toLowerCase());
  const ok = customer && await bcrypt.compare(password, customer.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  req.session.customerId = customer.id;
  res.json({ ok: true, customer: publicCustomer(customer) });
});

router.post('/logout', (req, res) => {
  delete req.session.customerId;
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.session || !req.session.customerId) return res.json({ authenticated: false });
  const data = db.read();
  const customer = data.customers.find(c => c.id === req.session.customerId);
  if (!customer) return res.json({ authenticated: false });
  res.json({ authenticated: true, customer: publicCustomer(customer) });
});

router.get('/my-orders', requireCustomer, (req, res) => {
  const data = db.read();
  const orders = data.orders.filter(o => o.customerId === req.session.customerId);
  res.json(orders);
});

// Always responds the same way whether or not the email exists, so an
// attacker can't use this endpoint to discover which emails have accounts.
router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body || {};
  const genericResponse = { ok: true, message: 'If an account exists with that email, a reset link has been sent.' };
  if (!email) return res.json(genericResponse);

  const data = db.read();
  const customer = data.customers.find(c => c.email.toLowerCase() === email.toLowerCase());
  if (customer) {
    const token = crypto.randomBytes(32).toString('hex');
    customer.resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    customer.resetTokenExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    db.write(data);

    const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${base}/reset-password.html?token=${token}&email=${encodeURIComponent(customer.email)}`;
    if (!mailer.isConfigured) {
      console.log(`\n📧 [Email not configured] Password reset link for ${customer.email}:\n${resetUrl}\n`);
    }
    mailer.sendPasswordReset(customer, resetUrl);
  }
  res.json(genericResponse);
});

router.post('/reset-password', authLimiter, async (req, res) => {
  const { email, token, newPassword } = req.body || {};
  if (!email || !token || !newPassword) return res.status(400).json({ error: 'Missing required fields' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const data = db.read();
  const customer = data.customers.find(c => c.email.toLowerCase() === email.toLowerCase());
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  if (!customer || !customer.resetTokenHash || customer.resetTokenHash !== tokenHash || Date.now() > customer.resetTokenExpires) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  }

  customer.passwordHash = await bcrypt.hash(newPassword, 10);
  delete customer.resetTokenHash;
  delete customer.resetTokenExpires;
  db.write(data);
  res.json({ ok: true, message: 'Password updated. You can now sign in.' });
});

module.exports = router;

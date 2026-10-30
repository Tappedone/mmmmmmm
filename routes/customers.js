const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAdmin, requireCustomer } = require('../middleware/auth');
const fieldCrypto = require('../utils/crypto');
const { normalizePhone } = require('../utils/phone');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false
});

const MIN_PASSWORD = 8;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10); // keeps "no such account" as slow as "wrong password"

function publicCustomer(c) {
  return { id: c.id, name: fieldCrypto.decrypt(c.name) || '', phone: fieldCrypto.decrypt(c.phone) };
}

// Finds an account by phone number. Phone numbers are stored encrypted, so we look
// them up by a fingerprint (phoneKey) instead of decrypting every account.
// Returns { customer, changed } — `changed` means the account's fingerprint was
// brought up to date and the data should be saved.
function findByPhone(data, normalized) {
  const current = fieldCrypto.blindIndex(normalized);
  const legacy = fieldCrypto.plainIndex(normalized);
  let customer = data.customers.find(c => c.phoneKey === current || c.phoneKey === legacy);
  if (!customer) {
    // Accounts created before phone login existed have no fingerprint yet.
    customer = data.customers.find(c => !c.phoneKey && normalizePhone(fieldCrypto.decrypt(c.phone)) === normalized);
  }
  let changed = false;
  if (customer && customer.phoneKey !== current) { customer.phoneKey = current; changed = true; }
  return { customer, changed };
}

// New session on every login/signup, so a session id planted beforehand is useless.
function startSession(req, customerId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) return reject(err);
      req.session.customerId = customerId;
      resolve();
    });
  });
}

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    const name = String((req.body && req.body.name) || '').trim().slice(0, 100);
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone number and password are required' });
    }
    const normalized = normalizePhone(phone);
    if (!normalized) return res.status(400).json({ error: 'Please enter a valid phone number' });
    if (String(password).length < MIN_PASSWORD) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
    }
    if (String(password).length > 200) return res.status(400).json({ error: 'Password is too long' });

    const data = db.read();
    const { customer: existing } = findByPhone(data, normalized);
    if (existing) {
      return res.status(409).json({ error: 'An account with this phone number already exists. Please sign in instead.' });
    }

    const id = db.id('cust');
    const phoneText = String(phone).trim().slice(0, 30);
    data.customers.push({
      id,
      name: fieldCrypto.encrypt(name),
      phone: fieldCrypto.encrypt(phoneText),
      phoneKey: fieldCrypto.blindIndex(normalized),
      passwordHash: await bcrypt.hash(String(password), 10),
      createdAt: new Date().toISOString()
    });
    db.write(data);

    await startSession(req, id);
    res.status(201).json({ ok: true, customer: { id, name, phone: phoneText } });
  } catch (err) {
    console.error('Register failed:', err.message);
    res.status(500).json({ error: 'Could not create the account. Please try again.' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    const normalized = normalizePhone(phone);
    if (!normalized || !password) {
      return res.status(400).json({ error: 'Phone number and password are required' });
    }

    const data = db.read();
    const { customer, changed } = findByPhone(data, normalized);
    const ok = await bcrypt.compare(String(password), customer ? customer.passwordHash : DUMMY_HASH);
    if (!customer || !ok) return res.status(401).json({ error: 'Invalid phone number or password' });

    if (changed) db.write(data);
    await startSession(req, customer.id);
    res.json({ ok: true, customer: publicCustomer(customer) });
  } catch (err) {
    console.error('Login failed:', err.message);
    res.status(500).json({ error: 'Could not sign in. Please try again.' });
  }
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
  const orders = data.orders
    .filter(o => o.customerId === req.session.customerId)
    .map(o => ({
      ...o,
      name: fieldCrypto.decrypt(o.name),
      phone: fieldCrypto.decrypt(o.phone),
      address: fieldCrypto.decrypt(o.address)
    }));
  res.json(orders);
});

router.post('/change-password', requireCustomer, authLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords are required' });
    if (String(newPassword).length < MIN_PASSWORD) {
      return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD} characters` });
    }
    if (String(newPassword).length > 200) return res.status(400).json({ error: 'Password is too long' });

    const data = db.read();
    const customer = data.customers.find(c => c.id === req.session.customerId);
    if (!customer) return res.status(401).json({ error: 'Please sign in again.' });
    if (!(await bcrypt.compare(String(currentPassword), customer.passwordHash))) {
      return res.status(401).json({ error: 'Your current password is incorrect' });
    }
    customer.passwordHash = await bcrypt.hash(String(newPassword), 10);
    db.write(data);
    res.json({ ok: true });
  } catch (err) {
    console.error('Change password failed:', err.message);
    res.status(500).json({ error: 'Could not change the password. Please try again.' });
  }
});

// ---------- ADMIN ----------

router.get('/admin/all', requireAdmin, (req, res) => {
  const data = db.read();
  const counts = new Map();
  for (const o of data.orders) counts.set(o.customerId, (counts.get(o.customerId) || 0) + 1);
  const list = data.customers
    .map(c => ({ ...publicCustomer(c), createdAt: c.createdAt, orderCount: counts.get(c.id) || 0 }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json(list);
});

// Customers can't reset their own password (there's no email) — they message you on
// WhatsApp, you press this, and send them the temporary password it shows.
router.post('/admin/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const data = db.read();
    const customer = data.customers.find(c => c.id === req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // no look-alike characters
    let tempPassword = '';
    for (let i = 0; i < 10; i++) tempPassword += alphabet[crypto.randomInt(alphabet.length)];

    customer.passwordHash = await bcrypt.hash(tempPassword, 10);
    db.write(data);
    res.json({ ok: true, tempPassword, phone: fieldCrypto.decrypt(customer.phone) });
  } catch (err) {
    console.error('Reset password failed:', err.message);
    res.status(500).json({ error: 'Could not reset the password.' });
  }
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// Blocks brute-force password guessing: max 8 attempts per IP every 15 minutes.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Admin credentials come from environment variables (.env), never hardcoded.
// ADMIN_USERNAME=your_username
// ADMIN_PASSWORD_HASH=generated with: node hash-password.js yourpassword
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;

  if (!expectedUser || !expectedHash) {
    return res.status(500).json({ error: 'Admin account not configured on server. See README setup step.' });
  }
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const userOk = username === expectedUser;
  const passOk = userOk && await bcrypt.compare(password, expectedHash);

  if (!userOk || !passOk) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.isAdmin = true;
  req.session.username = username;
  res.json({ ok: true, username });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.json({ authenticated: true, username: req.session.username });
  }
  res.json({ authenticated: false });
});

module.exports = router;

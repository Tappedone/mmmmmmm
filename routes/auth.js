const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const otplib = require('otplib');
const router = express.Router();

// Blocks brute-force password guessing: max 8 attempts per IP every 15 minutes.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  skipSuccessfulRequests: true, // only failed attempts count against you
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Admin credentials come from environment variables, never hardcoded:
//   ADMIN_USERNAME=your_username
//   ADMIN_PASSWORD_HASH=generated with: node hash-password.js yourpassword
// If you can't run that command (e.g. you only have a phone), you can instead set
//   ADMIN_PASSWORD=your_password
// in your host's private variables — it's hashed in memory when the server starts.
const ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH ||
  (process.env.ADMIN_PASSWORD ? bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10) : null);

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, totpCode } = req.body || {};
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedHash = ADMIN_HASH;
  const totpSecret = process.env.ADMIN_TOTP_SECRET;

  if (!expectedUser || !expectedHash) {
    return res.status(500).json({ error: 'Admin account not configured on server. See README setup step.' });
  }
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // Always run the password check, even for a wrong username, so response time doesn't reveal which usernames exist.
  const passOk = await bcrypt.compare(String(password), expectedHash);
  const userOk = username === expectedUser;

  if (!userOk || !passOk) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // 2FA only enforced once ADMIN_TOTP_SECRET is set up (see setup-2fa.js).
  // Until then, login works with just username/password, same as before.
  if (totpSecret) {
    if (!totpCode) {
      return res.status(401).json({ error: '2FA code required', requiresTotp: true });
    }
    const result = await otplib.verify({ token: String(totpCode).trim(), secret: totpSecret });
    if (!result.valid) {
      return res.status(401).json({ error: 'Invalid or expired authentication code' });
    }
  }

  // Fresh session id on login, so one planted beforehand can't be reused.
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not start a session. Please try again.' });
    req.session.isAdmin = true;
    req.session.username = username;
    res.json({ ok: true, username });
  });
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

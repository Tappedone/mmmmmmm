const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const otplib = require('otplib');
const router = express.Router();

// Blocks brute-force password guessing: max 8 failed attempts per visitor every 15 minutes.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  skipSuccessfulRequests: true, // only failed attempts count against you
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ---------- Admin credentials (read once at startup) ----------
// Variables pasted into a host's dashboard often carry a stray space or line break — strip those.
const clean = v => String(v == null ? '' : v).trim();

const ADMIN_USER = clean(process.env.ADMIN_USERNAME);
const PLAIN_PASSWORD = clean(process.env.ADMIN_PASSWORD);
const HASH_FROM_ENV = clean(process.env.ADMIN_PASSWORD_HASH);

// If BOTH are set, ADMIN_PASSWORD wins: a leftover hash from an older setup must not
// silently override the password you just typed into the dashboard.
let ADMIN_HASH = null;
let PASSWORD_SOURCE = 'not set';
const warnings = [];
if (PLAIN_PASSWORD) {
  ADMIN_HASH = bcrypt.hashSync(PLAIN_PASSWORD, 10);
  PASSWORD_SOURCE = 'ADMIN_PASSWORD';
  if (HASH_FROM_ENV) warnings.push('Both ADMIN_PASSWORD and ADMIN_PASSWORD_HASH are set — using ADMIN_PASSWORD. Delete ADMIN_PASSWORD_HASH to avoid confusion.');
} else if (HASH_FROM_ENV) {
  ADMIN_HASH = HASH_FROM_ENV;
  PASSWORD_SOURCE = 'ADMIN_PASSWORD_HASH';
  if (!/^\$2[aby]\$\d\d\$.{53}$/.test(HASH_FROM_ENV)) {
    warnings.push('ADMIN_PASSWORD_HASH does not look like a valid hash (it should start with $2a$ or $2b$ and be 60 characters) — nobody will be able to log in. Easier fix: delete it and set ADMIN_PASSWORD instead.');
  }
}

// ---------- Optional 2FA ----------
// A secret typed or copied by hand often has spaces, dashes or lowercase letters; tidy it up,
// and check it once now — a bad secret must never be able to crash a login.
const TOTP = { state: 'off', secret: null };
const rawTotp = clean(process.env.ADMIN_TOTP_SECRET);
if (rawTotp) {
  const secret = rawTotp.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  try {
    otplib.generateSync({ secret });
    TOTP.state = 'on';
    TOTP.secret = secret;
  } catch (e) {
    TOTP.state = 'invalid';
    warnings.push('ADMIN_TOTP_SECRET is not valid (only letters A–Z and digits 2–7 are allowed, at least 16 characters). Admin login is blocked until you fix it or delete it.');
  }
}

router.describeConfig = () => [
  `Admin login:    username "${ADMIN_USER || '(not set)'}" (capitals/spaces don't matter), password from ${PASSWORD_SOURCE}, 2FA ${TOTP.state === 'on' ? 'ON' : TOTP.state === 'invalid' ? 'INVALID' : 'off'}`,
  ...warnings.map(w => '⚠️  ' + w)
];

function fail(req, reason) {
  console.warn(`Admin login failed (${reason}) from ${req.ip}`);
}

router.post('/login', loginLimiter, async (req, res) => {
  try {
    if (!ADMIN_USER || !ADMIN_HASH) {
      console.error('Admin login attempted but no admin account is configured. Set ADMIN_USERNAME and ADMIN_PASSWORD in your variables.');
      return res.status(500).json({ error: 'The admin account is not set up on the server yet. Add ADMIN_USERNAME and ADMIN_PASSWORD in your Railway Variables.' });
    }
    const body = req.body || {};
    const username = clean(body.username);
    const typed = String(body.password == null ? '' : body.password);
    if (!username || !typed) return res.status(400).json({ error: 'Username and password required' });

    // Phone keyboards love to add a capital first letter or a trailing space.
    // Username: not case-sensitive. Password: accepted as typed, or with outer spaces removed.
    // The password check always runs, so response time doesn't reveal whether the username exists.
    let passOk = await bcrypt.compare(typed, ADMIN_HASH);
    if (!passOk && typed !== typed.trim()) passOk = await bcrypt.compare(typed.trim(), ADMIN_HASH);
    const userOk = username.toLowerCase() === ADMIN_USER.toLowerCase();

    if (!userOk || !passOk) {
      fail(req, !userOk ? 'unknown username' : 'wrong password');
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (TOTP.state === 'invalid') {
      console.error('Admin login blocked: ADMIN_TOTP_SECRET is invalid.');
      return res.status(500).json({ error: 'Two-factor login is set up incorrectly on the server. In your Railway Variables, fix ADMIN_TOTP_SECRET (letters A–Z and digits 2–7 only) or delete it to turn 2FA off.' });
    }
    if (TOTP.state === 'on') {
      if (!body.totpCode) return res.status(401).json({ error: '2FA code required', requiresTotp: true });
      const code = String(body.totpCode).replace(/\s/g, '');
      // epochTolerance: accept the code from one 30-second step either side, so small clock differences don't matter
      const result = await otplib.verify({ token: code, secret: TOTP.secret, epochTolerance: 30 });
      if (!result.valid) {
        fail(req, 'wrong 2FA code');
        return res.status(401).json({ error: 'Invalid or expired authentication code' });
      }
    }

    // Fresh session id on login, so one planted beforehand can't be reused.
    req.session.regenerate(err => {
      if (err) {
        console.error('Could not start an admin session:', err.message);
        return res.status(500).json({ error: 'Could not start a session (the server could not save it). Please try again.' });
      }
      req.session.isAdmin = true;
      req.session.username = ADMIN_USER;
      console.log(`Admin signed in from ${req.ip}`);
      res.json({ ok: true, username: ADMIN_USER });
    });
  } catch (err) {
    // Whatever goes wrong, answer the request — and never take the site down with it.
    console.error('Admin login error:', err && err.message);
    res.status(500).json({ error: 'Login failed because of a server problem. Please try again.' });
  }
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

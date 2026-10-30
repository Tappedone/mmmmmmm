require('dotenv').config();
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { DATA_DIR, UPLOAD_DIR } = require('./config');

const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const settingsRoutes = require('./routes/settings');
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) {
  if (IS_PROD) {
    console.error('❌ SESSION_SECRET is not set. Refusing to start in production with an insecure default. Add it to your environment variables.');
    process.exit(1);
  }
  console.warn('⚠️  SESSION_SECRET is not set in .env — using a temporary insecure value. Set it before deploying.');
}
if (!process.env.ADMIN_USERNAME || !(process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD)) {
  console.warn('⚠️  Admin login is not configured (ADMIN_USERNAME and ADMIN_PASSWORD or ADMIN_PASSWORD_HASH) — you will not be able to log into /admin.');
}

app.set('trust proxy', 1); // needed on Railway/Render etc. so HTTPS and visitor IPs are detected correctly

// Hosts ping this to confirm the app is alive after each deploy.
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// In production, force HTTPS so a session cookie is never sent over plain HTTP.
app.use((req, res, next) => {
  if (IS_PROD && req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(301, 'https://' + req.headers.host + req.url);
  }
  next();
});

// Never serve .env / .git style files, whatever else changes later.
app.use((req, res, next) => {
  if (/(^|\/)\.(env|git|railwayignore|gitignore)/i.test(req.path)) return res.status(404).end();
  next();
});

app.use(compression());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],            // fonts are hosted on this site — no Google request
      imgSrc: ["'self'", "data:", "blob:"],
      scriptSrc: ["'self'"],
      // The storefront/admin UI use onclick="..." attributes for buttons. This lets those
      // static, developer-written handlers run, while scriptSrc above still blocks any
      // script from anywhere but this server — the real protection against injected scripts.
      scriptSrcAttr: ["'unsafe-inline'"]
    }
  }
}));

// ---------- Static files (served BEFORE sessions, so photos/CSS/JS never wait on a session lookup) ----------
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Product photos get a random name when uploaded and never change, so browsers can keep them for a month.
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));

// Fonts never change either.
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts'), { maxAge: '365d', immutable: true }));

// Pages, CSS and JS: the browser re-checks them each visit (a tiny "not modified" reply when nothing
// changed), so a new deploy shows up immediately and old/new files never get mixed.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));

// ---------- API ----------
app.use(express.json({ limit: '1mb' }));

const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

app.use(session({
  store: new FileStore({ path: SESSIONS_DIR, logFn: () => {} }),
  secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8 // 8 hours
  }
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600, // generous for normal browsing/shopping, blocks scraping/abuse bursts
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/settings', settingsRoutes);

// Unknown API paths get a proper 404 instead of the homepage
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Fallbacks so refreshing /admin still loads the right page
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Any error (bad upload, oversized photo, ...) comes back as clean JSON — never a stack trace.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'That photo is too large (max 15 MB).' });
  }
  if (err && (err.name === 'MulterError' || err.message === 'Only jpg, png or webp images are allowed')) {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid request' });
  }
  console.error('Unexpected error:', err && err.message);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Maison Bennani running on http://localhost:${PORT}`);
});

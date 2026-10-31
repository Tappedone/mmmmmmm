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
const fieldCrypto = require('./utils/crypto');

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
// ---------- Start-up checks (problems show up in the logs in plain words) ----------
function ensureWritable(dir, label) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.write-test-' + process.pid);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch (err) {
    console.error(`❌ The ${label} folder cannot be used: ${dir} (${err.code || err.message})`);
    console.error('   On Railway: make sure the volume mount path matches STORAGE_DIR / DATA_DIR / UPLOAD_DIR.');
    console.error('   If the error is EACCES (permission denied), add the variable RAILWAY_RUN_UID with the value 0.');
    return false;
  }
}
if (!ensureWritable(DATA_DIR, 'data') | !ensureWritable(UPLOAD_DIR, 'photos')) {
  console.error('Stopping, because products, orders and logins cannot be saved. Fix the above and redeploy.');
  process.exit(1);
}

// A stray problem in one request must never take the whole site down.
process.on('unhandledRejection', (reason) => {
  console.error('Unexpected error (the site keeps running):', reason && reason.message ? reason.message : reason);
});

// ---------- Visitor addresses behind Railway's proxies ----------
// Login limits and abuse protection count attempts per visitor address. Behind a host's proxies the
// server first sees the proxy's own (internal) address, so we trust the connection's immediate proxy
// and any further hops that are internal/private addresses; the first public address after that is
// the visitor. An address a visitor invents in the X-Forwarded-For header is ignored, because it
// sits to the left of the real one. Override with TRUST_PROXY (a number of proxies, or "false") if needed.
function isInternalAddress(ip) {
  if (!ip) return false;
  let a = String(ip).toLowerCase();
  if (a.startsWith('::ffff:')) a = a.slice(7);
  if (a === '::1') return true;
  if (a.includes(':')) return /^(fc|fd|fe80)/.test(a); // IPv6 private / link-local
  const p = a.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !(n >= 0 && n <= 255))) return false;
  return p[0] === 10 || p[0] === 127 ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || // 100.64.0.0/10 — used inside Railway's network
    (p[0] === 169 && p[1] === 254);
}
function parseTrustProxy(v) {
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  return v;
}
app.set('trust proxy', process.env.TRUST_PROXY ? parseTrustProxy(process.env.TRUST_PROXY) : (ip, hop) => hop === 0 || isInternalAddress(ip));

// Say once, in the logs, which address the server thinks a visitor has — so a wrong setup is obvious.
let addressChecked = false;
app.use('/api', (req, res, next) => {
  if (!addressChecked) {
    addressChecked = true;
    console.log(`Visitor address check: ip=${req.ip}  x-forwarded-for=${req.headers['x-forwarded-for'] || '-'}  x-real-ip=${req.headers['x-real-ip'] || '-'}`);
    if (IS_PROD && isInternalAddress(req.ip)) {
      console.warn('⚠️  Visitors look like they all share one internal address, so login limits would apply to everyone at once. Set the variable TRUST_PROXY to 2 (or 3) and check this line again.');
    }
  }
  next();
});

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
    // 'auto' = Secure whenever the visitor is on HTTPS (always, on the live site). Forcing it on would
    // silently break logins if a proxy ever failed to say the connection is HTTPS.
    secure: IS_PROD ? 'auto' : false,
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
  console.log(`Maison Bennani running on http://localhost:${PORT} (${IS_PROD ? 'production' : 'development'})`);
  console.log(`Data folder:    ${DATA_DIR}`);
  console.log(`Photos folder:  ${UPLOAD_DIR}`);
  console.log(`Encryption:     ${fieldCrypto.isEnabled ? 'on' : 'OFF — customer details are stored as plain text (set ENCRYPTION_KEY)'}`);
  authRoutes.describeConfig().forEach(line => console.log(line));
});

// Simple, dependency-free JSON file database.
// Fine for a catalog of this size (dozens–hundreds of products/orders).
// If the business grows a lot, this can be swapped for Postgres/MySQL later
// without changing the route logic much (same get/set shape).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { DATA_DIR } = require('./config');
const FILE = path.join(DATA_DIR, 'store.json');

function id(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

function seed() {
  // A live site starts with an EMPTY catalog so fake sample products never reach real customers.
  // Local testing (anything that isn't NODE_ENV=production) gets a few samples to look at.
  const products = [];
  if (process.env.NODE_ENV !== 'production') {
    const now = new Date().toISOString();
    const mk = (name, category, price, stock, extra = {}) => {
      const p = {
        id: id('prod'), name, category, price, compareAtPrice: null, stock,
        description: 'Sample product — replace this description and photo from the admin panel.',
        bundle: [], image: null, imageThumb: null, active: true, createdAt: now, ...extra
      };
      products.push(p);
      return p;
    };
    const men = ['Noir Absolu', 'Oud Royal', 'Steel Vetiver'].map((n, i) => mk(n, 'Men', 229 + i * 20, 20));
    const women = ['Rose Éclat', 'Jasmin Doré', 'Velvet Iris'].map((n, i) => mk(n, 'Women', 249 + i * 20, 20));
    mk('Duo Prestige', 'Gift Sets', 420, 0, { compareAtPrice: men[0].price + women[0].price, bundle: [{ productId: men[0].id, qty: 1 }, { productId: women[0].id, qty: 1 }] });
    mk('Trio Signature', 'Gift Sets', 590, 0, { bundle: [{ productId: men[1].id, qty: 1 }, { productId: women[1].id, qty: 1 }, { productId: women[2].id, qty: 1 }] });
  }
  return {
    products,
    orders: [],
    settings: {
      deliveryDefault: 35,
      freeDeliveryThreshold: 600,
      cityFees: { Casablanca: 25, Rabat: 25, Marrakech: 35, Fes: 35, Tangier: 35, Agadir: 40, Meknes: 35, Oujda: 45, Kenitra: 30 },
      storeName: 'Maison Bennani',
      currency: 'DH',
      whatsappNumber: ''
    }
  };
}

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, JSON.stringify(seed(), null, 2));
  }
}

function read() {
  ensureFile();
  let data;
  try {
    data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch (err) {
    console.error('store.json could not be read (' + err.message + ') — trying the newest backup...');
    data = readNewestBackup();
    if (!data) throw err;
  }
  // Migrations: older files may lack newer fields.
  if (!data.settings) data.settings = {};
  if (data.settings.whatsappNumber === undefined) data.settings.whatsappNumber = '';
  return data;
}

function readNewestBackup() {
  try {
    const dir = path.join(DATA_DIR, 'backups');
    const files = fs.readdirSync(dir).filter(f => f.startsWith('store-')).sort().reverse();
    for (const f of files) {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); } catch (e) { /* try the next one */ }
    }
  } catch (e) { /* no backups */ }
  return null;
}

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 30;

function backupBeforeWrite() {
  if (!fs.existsSync(FILE)) return;
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(FILE, path.join(BACKUP_DIR, `store-${stamp}.json`));
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('store-')).sort();
  while (files.length > MAX_BACKUPS) {
    fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
  }
}

function write(data) {
  backupBeforeWrite();
  // Write to a temporary file first, then swap it in — a crash or power loss mid-write
  // can never leave a half-written (corrupt) store.json behind.
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}

module.exports = { read, write, id };

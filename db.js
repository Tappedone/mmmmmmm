// Simple, dependency-free JSON file database.
// Fine for a catalog of this size (dozens–hundreds of products/orders).
// If the business grows a lot, this can be swapped for Postgres/MySQL later
// without changing the route logic much (same get/set shape).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'store.json');

function id(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

function seed() {
  const cats = ['Men', 'Women', 'Gift Sets'];
  const names = {
    Men: ['Noir Absolu', 'Oud Royal', 'Steel Vetiver', 'Midnight Cedar', 'Sultan d\'Ambre'],
    Women: ['Rose Éclat', 'Jasmin Doré', 'Velvet Iris', 'Blanc de Fleur', 'Miel Sauvage'],
    'Gift Sets': ['Duo Prestige', 'Trio Signature', 'Coffret Élégance']
  };
  const products = [];
  let i = 1;
  for (const cat of cats) {
    for (const n of names[cat]) {
      products.push({
        id: id('prod'),
        name: n,
        category: cat,
        price: cat === 'Gift Sets' ? 400 + i * 15 : 220 + i * 9,
        compareAtPrice: null,
        stock: 15 + i,
        description: 'A premium fragrance crafted with rare essences, designed for lasting presence. Replace this description and photo from the admin panel.',
        image: null,
        active: true,
        createdAt: new Date().toISOString()
      });
      i++;
    }
  }
  return {
    products,
    orders: [],
    customers: [],
    settings: {
      deliveryDefault: 35,
      freeDeliveryThreshold: 600,
      cityFees: { Casablanca: 25, Rabat: 25, Marrakech: 35, Fes: 35, Tangier: 35, Agadir: 40, Meknes: 35, Oujda: 45, Kenitra: 30 },
      storeName: 'Maison Bennani',
      currency: 'DH'
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
  const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  // Migration: older store.json files (created before accounts existed) won't have this field.
  if (!data.customers) data.customers = [];
  return data;
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
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

module.exports = { read, write, id };

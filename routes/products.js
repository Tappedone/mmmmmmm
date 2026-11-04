const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { UPLOAD_DIR } = require('../config');
const { isBundle, enrichProduct } = require('../utils/bundles');

const router = express.Router();
const VALID_CATEGORIES = ['Men', 'Women', 'Gift Sets'];

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- Images ----------
// Photos are resized and converted to WebP when uploaded, in two sizes:
//   • a small one for the product grid (fast to load on phones)
//   • a larger one for the product page
// Phone photos are often 3–8 MB; the files customers actually download are ~30–150 KB.
const ALLOWED = ['.jpg', '.jpeg', '.png', '.webp'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.includes(ext)) return cb(new Error('Only jpg, png or webp images are allowed'));
    cb(null, true);
  }
});

async function processImage(buffer) {
  const base = 'img_' + crypto.randomBytes(8).toString('hex');
  const img = sharp(buffer).rotate(); // rotate() fixes sideways phone photos; metadata (incl. GPS) is dropped
  await Promise.all([
    img.clone()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(UPLOAD_DIR, base + '.webp')),
    img.clone()
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72 })
      .toFile(path.join(UPLOAD_DIR, base + '-thumb.webp'))
  ]);
  return { image: '/uploads/' + base + '.webp', imageThumb: '/uploads/' + base + '-thumb.webp' };
}

// Deletes a product's photo files. Only ever touches files inside UPLOAD_DIR
// (path.basename strips any folder parts), so a bad stored value can't point elsewhere.
function removeProductImages(p) {
  for (const ref of [p.image, p.imageThumb]) {
    if (ref && ref.startsWith('/uploads/')) {
      fs.unlink(path.join(UPLOAD_DIR, path.basename(ref)), () => {});
    }
  }
}

// ---------- Helpers ----------
function byIdMap(products) {
  return new Map(products.map(p => [p.id, p]));
}

// What shoppers see: for gift-set bundles, stock is the number of complete sets available.
function publicProduct(p, byId) {
  const e = enrichProduct(p, byId);
  const { bundle, availableStock, ...rest } = e;
  if (isBundle(p)) rest.stock = availableStock;
  return rest;
}

function cleanText(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

// Validates the list of perfumes chosen for a gift set. Only Men/Women perfumes can go in a set.
function parseBundle(raw, products, selfId) {
  let list;
  try { list = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw; } catch (e) { return { error: 'Invalid gift set contents' }; }
  if (!Array.isArray(list)) return { error: 'Invalid gift set contents' };
  if (list.length > 3) return { error: 'A gift set can include at most 3 perfumes' };

  const byId = byIdMap(products);
  const result = [];
  const seen = new Set();
  for (const item of list) {
    if (!item) continue;
    // Allow custom perfumes
    if (item.custom || item.customName || (!item.productId && item.name) || (typeof item.productId === 'string' && item.productId.indexOf('custom_') === 0)) {
      const name = (item.name || item.customName || '').trim();
      if (!name) return { error: 'Custom perfume must have a name' };
      const qty = Math.min(10, Math.max(1, parseInt(item.qty, 10) || 1));
      let price = undefined;
      if (item.price !== undefined && item.price !== null && item.price !== '') {
        price = parseFloat(item.price);
        if (isNaN(price) || price < 0) return { error: 'Invalid price for a perfume in the gift set' };
      } else if (item.customPrice !== undefined && item.customPrice !== null && item.customPrice !== '') {
        price = parseFloat(item.customPrice);
        if (isNaN(price) || price < 0) return { error: 'Invalid price for a perfume in the gift set' };
      }
      const entry = { custom: true, name: name.slice(0, 120), productId: item.productId || ('custom_' + Date.now().toString(36)), qty };
      if (price !== undefined) entry.price = price;
      result.push(entry);
      continue;
    }
    const c = byId.get(item && item.productId);
    if (!c || c.id === selfId) return { error: 'One of the selected perfumes no longer exists' };
    if (c.category === 'Gift Sets') return { error: 'Only perfumes from Men or Women can be added to a gift set' };
    const key = c.id;
    if (seen.has(key)) {
      const existing = result.find(r => r.productId === key && !r.custom);
      if (existing) {
        existing.qty = Math.min(10, (existing.qty || 1) + Math.min(10, Math.max(1, parseInt(item.qty, 10) || 1)));
        continue;
      }
    }
    seen.add(key);
    const qty = Math.min(10, Math.max(1, parseInt(item.qty, 10) || 1));
    let price = undefined;
    if (item.price !== undefined && item.price !== null && item.price !== '') {
      price = parseFloat(item.price);
      if (isNaN(price) || price < 0) return { error: 'Invalid price for a perfume in the gift set' };
    } else if (item.customPrice !== undefined && item.customPrice !== null && item.customPrice !== '') {
      price = parseFloat(item.customPrice);
      if (isNaN(price) || price < 0) return { error: 'Invalid price for a perfume in the gift set' };
    }
    const entry = { productId: c.id, qty };
    if (price !== undefined) entry.price = price;
    result.push(entry);
  }
  return { bundle: result };
}

function setsUsing(productId, products) {
  return products.filter(p => isBundle(p) && p.bundle.some(b => b.productId === productId));
}

// ---------- PUBLIC ----------

// GET /api/products?category=Men&q=rose&sort=low
router.get('/', (req, res) => {
  const data = db.read();
  const byId = byIdMap(data.products);
  let list = data.products.filter(p => p.active);
  const { category, q, sort } = req.query;
  if (category && category !== 'All') list = list.filter(p => p.category === category);
  if (q) {
    const needle = String(q).toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(needle));
  }
  if (sort === 'low') list = [...list].sort((a, b) => a.price - b.price);
  if (sort === 'high') list = [...list].sort((a, b) => b.price - a.price);
  res.set('Cache-Control', 'public, max-age=20, stale-while-revalidate=60');
  res.json(list.map(p => publicProduct(p, byId)));
});

router.get('/:id', (req, res) => {
  const data = db.read();
  const p = data.products.find(x => x.id === req.params.id && x.active);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(publicProduct(p, byIdMap(data.products)));
});

// ---------- ADMIN ----------

// All products including hidden ones, with the raw bundle and the computed stock for sets
router.get('/admin/all', requireAdmin, (req, res) => {
  const data = db.read();
  const byId = byIdMap(data.products);
  res.json(data.products.map(p => enrichProduct(p, byId)));
});

router.post('/admin', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const data = db.read();
    const { category, price, compareAtPrice, stock } = req.body;
    const name = cleanText(req.body.name, 120);
    if (!name || !category || price === undefined) {
      return res.status(400).json({ error: 'name, category and price are required' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Category must be Men, Women or Gift Sets' });
    }

    let bundle = [];
    if (category === 'Gift Sets' && req.body.bundle) {
      const parsed = parseBundle(req.body.bundle, data.products, null);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      bundle = parsed.bundle;
    }

    const images = req.file ? await processImage(req.file.buffer) : { image: null, imageThumb: null };
    const product = {
      id: db.id('prod'),
      name,
      category,
      price: Math.max(0, parseFloat(price) || 0),
      compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
      stock: stock !== undefined && stock !== '' ? Math.max(0, parseInt(stock, 10) || 0) : 0,
      description: cleanText(req.body.description, 2000),
      bundle,
      ...images,
      active: true,
      createdAt: new Date().toISOString()
    };
    data.products.push(product);
    db.write(data);
    res.status(201).json(enrichProduct(product, byIdMap(data.products)));
  } catch (err) {
    console.error('Create product failed:', err.message);
    res.status(400).json({ error: "Couldn't save the product — if you added a photo, make sure it's a valid image." });
  }
});

router.put('/admin/:id', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const data = db.read();
    const p = data.products.find(x => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Product not found' });

    const { category, price, compareAtPrice, stock, active } = req.body;
    if (req.body.name !== undefined) {
      const name = cleanText(req.body.name, 120);
      if (!name) return res.status(400).json({ error: 'Name cannot be empty' });
      p.name = name;
    }
    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: 'Category must be Men, Women or Gift Sets' });
      }
      if (category === 'Gift Sets' && setsUsing(p.id, data.products).length > 0) {
        return res.status(409).json({ error: 'This perfume is part of a gift set, so it cannot become a gift set itself. Remove it from the set first.' });
      }
      p.category = category;
    }
    if (p.category !== 'Gift Sets') {
      p.bundle = [];
    } else if (req.body.bundle !== undefined) {
      const parsed = parseBundle(req.body.bundle, data.products, p.id);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      p.bundle = parsed.bundle;
    }
    if (price !== undefined) p.price = Math.max(0, parseFloat(price) || 0);
    if (compareAtPrice !== undefined) p.compareAtPrice = compareAtPrice === '' ? null : parseFloat(compareAtPrice);
    if (stock !== undefined && stock !== '') p.stock = Math.max(0, parseInt(stock, 10) || 0);
    if (req.body.description !== undefined) p.description = cleanText(req.body.description, 2000);
    if (active !== undefined) p.active = active === 'true' || active === true;

    if (req.file) {
      const images = await processImage(req.file.buffer);
      removeProductImages(p); // delete the old photo files
      p.image = images.image;
      p.imageThumb = images.imageThumb;
    }

    db.write(data);
    res.json(enrichProduct(p, byIdMap(data.products)));
  } catch (err) {
    console.error('Update product failed:', err.message);
    res.status(400).json({ error: "Couldn't save the product — if you added a photo, make sure it's a valid image." });
  }
});

router.delete('/admin/:id', requireAdmin, (req, res) => {
  const data = db.read();
  const idx = data.products.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });

  const usedIn = setsUsing(req.params.id, data.products);
  if (usedIn.length > 0) {
    return res.status(409).json({
      error: `This perfume is part of the gift set "${usedIn.map(s => s.name).join('", "')}". Remove it from the set first, or hide it instead of deleting.`
    });
  }

  const [removed] = data.products.splice(idx, 1);
  removeProductImages(removed);
  db.write(data);
  res.json({ ok: true });
});

module.exports = router;

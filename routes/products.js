const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'img_' + crypto.randomBytes(8).toString('hex') + ext);
  }
});
const ALLOWED = ['.jpg', '.jpeg', '.png', '.webp'];
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.includes(ext)) return cb(new Error('Only jpg, png or webp images are allowed'));
    cb(null, true);
  }
});

// ---------- PUBLIC ----------

// GET /api/products?category=Men&q=rose&sort=low
router.get('/', (req, res) => {
  const data = db.read();
  let list = data.products.filter(p => p.active);
  const { category, q, sort } = req.query;
  if (category && category !== 'All') list = list.filter(p => p.category === category);
  if (q) {
    const needle = q.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(needle));
  }
  if (sort === 'low') list = [...list].sort((a, b) => a.price - b.price);
  if (sort === 'high') list = [...list].sort((a, b) => b.price - a.price);
  res.json(list);
});

router.get('/:id', (req, res) => {
  const data = db.read();
  const p = data.products.find(x => x.id === req.params.id && x.active);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(p);
});

// ---------- ADMIN ----------

// List all products including inactive/out-of-stock, for the admin table
router.get('/admin/all', requireAdmin, (req, res) => {
  const data = db.read();
  res.json(data.products);
});

router.post('/admin', requireAdmin, upload.single('image'), (req, res) => {
  const data = db.read();
  const { name, category, price, compareAtPrice, stock, description } = req.body;
  if (!name || !category || price === undefined) {
    return res.status(400).json({ error: 'name, category and price are required' });
  }
  const product = {
    id: db.id('prod'),
    name,
    category,
    price: parseFloat(price) || 0,
    compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
    stock: stock !== undefined ? parseInt(stock, 10) : 0,
    description: description || '',
    image: req.file ? '/uploads/' + req.file.filename : null,
    active: true,
    createdAt: new Date().toISOString()
  };
  data.products.push(product);
  db.write(data);
  res.status(201).json(product);
});

router.put('/admin/:id', requireAdmin, upload.single('image'), (req, res) => {
  const data = db.read();
  const p = data.products.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });

  const { name, category, price, compareAtPrice, stock, description, active } = req.body;
  if (name !== undefined) p.name = name;
  if (category !== undefined) p.category = category;
  if (price !== undefined) p.price = parseFloat(price) || 0;
  if (compareAtPrice !== undefined) p.compareAtPrice = compareAtPrice === '' ? null : parseFloat(compareAtPrice);
  if (stock !== undefined) p.stock = parseInt(stock, 10) || 0;
  if (description !== undefined) p.description = description;
  if (active !== undefined) p.active = active === 'true' || active === true;

  if (req.file) {
    // remove old image file if it was an uploaded one
    if (p.image && p.image.startsWith('/uploads/')) {
      const oldPath = path.join(__dirname, '..', 'public', p.image);
      fs.unlink(oldPath, () => {});
    }
    p.image = '/uploads/' + req.file.filename;
  }

  db.write(data);
  res.json(p);
});

router.delete('/admin/:id', requireAdmin, (req, res) => {
  const data = db.read();
  const idx = data.products.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });
  const [removed] = data.products.splice(idx, 1);
  if (removed.image && removed.image.startsWith('/uploads/')) {
    fs.unlink(path.join(__dirname, '..', 'public', removed.image), () => {});
  }
  db.write(data);
  res.json({ ok: true });
});

module.exports = router;

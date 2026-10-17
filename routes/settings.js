const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Public: needed by the storefront to calculate delivery fees at checkout
router.get('/', (req, res) => {
  const data = db.read();
  res.json(data.settings);
});

router.put('/', requireAdmin, (req, res) => {
  const data = db.read();
  const { deliveryDefault, freeDeliveryThreshold, cityFees, storeName } = req.body || {};
  if (deliveryDefault !== undefined) data.settings.deliveryDefault = parseFloat(deliveryDefault) || 0;
  if (freeDeliveryThreshold !== undefined) data.settings.freeDeliveryThreshold = parseFloat(freeDeliveryThreshold) || 0;
  if (cityFees && typeof cityFees === 'object') data.settings.cityFees = cityFees;
  if (storeName) data.settings.storeName = storeName;
  db.write(data);
  res.json(data.settings);
});

module.exports = router;

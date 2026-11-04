// A Gift Set can be a "bundle": a list of perfumes taken from the Men / Women
// catalog, e.g. bundle: [{ productId: 'prod_x', qty: 1 }, ...].
// Its stock isn't typed in by hand — it's however many complete sets the
// perfumes currently in stock allow, so selling a set also reduces the stock
// of the individual perfumes inside it.

function isBundle(p) {
  return !!(p && Array.isArray(p.bundle) && p.bundle.length > 0);
}

// Adds what's inside a bundle (names, images) and how many sets can be sold.
function enrichProduct(p, byId) {
  if (p && p.category === 'Gift Sets') {
    const allPerfumes = [];
    if (byId && typeof byId.forEach === 'function') {
      for (const [id, prod] of byId) {
        if (prod && prod.category && prod.category !== 'Gift Sets' && prod.active !== false) {
          allPerfumes.push(prod);
        }
      }
    } else if (Array.isArray(byId)) {
      // fallback
    }
    // If we have access to products array? byId is a Map
    let available = Infinity;
    const bundleItems = [];
    if (allPerfumes.length > 0) {
      for (const c of allPerfumes) {
        const qty = 1;
        available = Math.min(available, Math.floor((c.stock || 0) / qty));
        bundleItems.push({
          productId: c.id,
          name: c.name,
          category: c.category,
          qty,
          price: c.price,
          originalPrice: c.price,
          image: c.imageThumb || c.image || null
        });
      }
    } else {
      // fallback to existing bundle
      const bundle = Array.isArray(p.bundle) ? p.bundle : [];
      for (let i = 0; i < bundle.length; i++) {
        const b = bundle[i];
        if (b.custom || b.customName || (!b.productId && b.name) || (typeof b.productId === 'string' && b.productId.indexOf('custom_') === 0)) {
          const qty = Math.max(1, parseInt(b.qty, 10) || 1);
          const customPrice = b.price !== undefined && b.price !== null ? parseFloat(b.price) : (b.customPrice !== undefined && b.customPrice !== null ? parseFloat(b.customPrice) : null);
          bundleItems.push({
            productId: b.productId || null,
            name: b.name || b.customName || 'Custom Perfume',
            category: b.category || 'Custom',
            qty,
            price: customPrice !== null && !isNaN(customPrice) ? customPrice : 0,
            originalPrice: customPrice !== null && !isNaN(customPrice) ? customPrice : 0,
            image: b.image || null,
            custom: true
          });
          continue;
        }
        const c = byId.get ? byId.get(b.productId) : null;
        if (!c) { available = 0; continue; }
        const qty = Math.max(1, parseInt(b.qty, 10) || 1);
        available = Math.min(available, Math.floor((c.stock || 0) / qty));
        const customPrice = b.price !== undefined && b.price !== null ? parseFloat(b.price) : (b.customPrice !== undefined && b.customPrice !== null ? parseFloat(b.customPrice) : null);
        bundleItems.push({
          productId: c.id,
          name: c.name,
          category: c.category,
          qty,
          price: customPrice !== null && !isNaN(customPrice) ? customPrice : c.price,
          originalPrice: c.price,
          image: c.imageThumb || c.image || null
        });
      }
    }
    if (!isFinite(available)) available = 999999;
    if (available < 0) available = 0;
    return { ...p, bundleItems, availableStock: available };
  }

  if (!isBundle(p)) return { ...p, bundleItems: [] };
  let available = Infinity;
  const bundleItems = [];
  const bundle = Array.isArray(p.bundle) ? p.bundle : [];
  for (let i = 0; i < bundle.length; i++) {
    const b = bundle[i];
    if (b.custom || b.customName || (!b.productId && b.name) || (typeof b.productId === 'string' && b.productId.indexOf('custom_') === 0)) {
      const qty = Math.max(1, parseInt(b.qty, 10) || 1);
      const customPrice = b.price !== undefined && b.price !== null ? parseFloat(b.price) : (b.customPrice !== undefined && b.customPrice !== null ? parseFloat(b.customPrice) : null);
      bundleItems.push({
        productId: b.productId || null,
        name: b.name || b.customName || 'Custom Perfume',
        category: b.category || 'Custom',
        qty,
        price: customPrice !== null && !isNaN(customPrice) ? customPrice : 0,
        originalPrice: customPrice !== null && !isNaN(customPrice) ? customPrice : 0,
        image: b.image || null,
        custom: true
      });
      continue;
    }
    const c = byId.get ? byId.get(b.productId) : null;
    if (!c) { available = 0; continue; } // a perfume in the set no longer exists
    const qty = Math.max(1, parseInt(b.qty, 10) || 1);
    available = Math.min(available, Math.floor((c.stock || 0) / qty));
    const customPrice = b.price !== undefined && b.price !== null ? parseFloat(b.price) : (b.customPrice !== undefined && b.customPrice !== null ? parseFloat(b.customPrice) : null);
    bundleItems.push({
      productId: c.id,
      name: c.name,
      category: c.category,
      qty,
      price: customPrice !== null && !isNaN(customPrice) ? customPrice : c.price,
      originalPrice: c.price,
      image: c.imageThumb || c.image || null
    });
  }
  if (!isFinite(available)) available = 0;
  // If all items are custom and we couldn't compute stock from existing products, don't zero it out
  const hasOnlyCustom = bundleItems.length > 0 && bundleItems.every(bi => bi.custom);
  if (hasOnlyCustom && !isFinite(available)) available = 999999;
  if (!isFinite(available)) available = 0;
  return { ...p, bundleItems, availableStock: available };
}

module.exports = { isBundle, enrichProduct };

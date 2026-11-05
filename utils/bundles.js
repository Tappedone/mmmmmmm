// Gift Sets come in two kinds. Either way, selling a set also reduces the stock of the
// individual perfumes in it, so a perfume can never be sold twice.
//
//  1. FIXED set — always the same perfumes:
//       bundle: [{ productId, qty }, ...]
//  2. CHOOSE-YOUR-OWN set — e.g. "any 3 perfumes for 500 DH":
//       pickCount: 3
//       poolAll: true            → customers may pick from EVERY Men/Women perfume (including ones added later)
//       pool: [productId, ...]   → …or only from this list (used when poolAll is false)
//     The price is the price of the set, whichever perfumes are chosen.

const SET_CATEGORIES = ['Men', 'Women'];
const MAX_SETS_CHECKED = 50;

function isBundle(p) {
  return !!(p && Array.isArray(p.bundle) && p.bundle.length > 0);
}

function isPickSet(p) {
  return !!(p && p.category === 'Gift Sets' && Number.isInteger(p.pickCount) && p.pickCount > 0);
}

// The perfumes a customer may choose from for a choose-your-own set (visible Men/Women perfumes only).
function poolOf(p, products) {
  const eligible = x => SET_CATEGORIES.includes(x.category) && x.active;
  if (p.poolAll) return products.filter(eligible);
  const ids = new Set(p.pool || []);
  return products.filter(x => ids.has(x.id) && eligible(x));
}

// How many complete sets could be sold, when every set needs `pickCount` DIFFERENT perfumes.
// k sets are possible exactly when the perfumes can supply pickCount*k units with no perfume used more than k times.
function pickSetAvailability(pickCount, pool) {
  const stocks = pool.map(x => Math.max(0, x.stock || 0));
  let sets = 0;
  for (let k = 1; k <= MAX_SETS_CHECKED; k++) {
    const supply = stocks.reduce((sum, s) => sum + Math.min(s, k), 0);
    if (supply >= pickCount * k) sets = k; else break;
  }
  return sets;
}

const miniItem = c => ({ productId: c.id, name: c.name, category: c.category, price: c.price, image: c.imageThumb || c.image || null });

// Adds what's inside a set (names, images, choices on offer) and how many sets can be sold.
function enrichProduct(p, byId) {
  if (isPickSet(p)) {
    const pool = poolOf(p, [...byId.values()]);
    return {
      ...p,
      bundleItems: [],
      pickItems: pool.map(c => ({ ...miniItem(c), stock: Math.max(0, c.stock || 0) })),
      availableStock: pickSetAvailability(p.pickCount, pool)
    };
  }
  if (!isBundle(p)) return { ...p, bundleItems: [], pickItems: [] };

  let available = Infinity;
  const bundleItems = [];
  for (const b of p.bundle) {
    const c = byId.get(b.productId);
    if (!c) { available = 0; continue; } // a perfume in the set no longer exists
    available = Math.min(available, Math.floor((c.stock || 0) / b.qty));
    bundleItems.push({ ...miniItem(c), qty: b.qty });
  }
  if (!isFinite(available)) available = 0;
  return { ...p, bundleItems, pickItems: [], availableStock: available };
}

module.exports = { SET_CATEGORIES, isBundle, isPickSet, poolOf, pickSetAvailability, enrichProduct };

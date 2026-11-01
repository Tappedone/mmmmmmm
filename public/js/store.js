document.getElementById('year').textContent = new Date().getFullYear();

const PLACEHOLDER_SVG = '<svg class="placeholder-bottle" viewBox="0 0 100 160" aria-hidden="true"><use href="#bottle"/></svg>';

const state = {
  all: [],            // every visible product, loaded once — filtering/searching/sorting happens on the phone, instantly
  loaded: false,
  settings: null,
  category: 'All',
  cart: readCart()
};

function readCart() {
  try {
    const c = JSON.parse(localStorage.getItem('mb_cart') || '[]');
    return Array.isArray(c) ? c.filter(l => l && typeof l.id === 'string' && l.qty > 0) : [];
  } catch (e) { return []; }
}

// Escapes text for safe use inside HTML — including inside "quoted" attributes.
function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2400);
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
const postJson = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function money(n) { return `${Number(n).toLocaleString()} ${state.settings ? state.settings.currency : 'DH'}`; }

// Moroccan numbers typed locally (06…) become international (212…) so WhatsApp links work.
function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = '212' + d.slice(1);
  else if (d.length === 9 && /^[5-8]/.test(d)) d = '212' + d;
  return d.length >= 8 && d.length <= 15 ? d : '';
}
function shopWhatsAppLink(text) {
  const n = state.settings && waNumber(state.settings.whatsappNumber);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : '';
}

function saveCart() { localStorage.setItem('mb_cart', JSON.stringify(state.cart)); updateCartCount(); }
function updateCartCount() {
  document.getElementById('cartCount').textContent = state.cart.reduce((s, c) => s + c.qty, 0);
}
const findProduct = id => state.all.find(p => p.id === id);

// ---------------- Products ----------------
function renderCategoryNav() {
  const cats = ['All', 'Men', 'Women', 'Gift Sets'];
  document.getElementById('catNav').innerHTML = cats.map(c =>
    `<button class="${c === state.category ? 'active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');
  document.querySelectorAll('#catNav button').forEach(b => b.onclick = () => setCategory(b.dataset.cat));
}

function setCategory(cat) {
  state.category = cat;
  document.getElementById('sectionTitle').textContent = cat === 'All' ? 'All Fragrances' : cat;
  renderCategoryNav();
  renderGrid();
}

function imgHtml(src, name, { eager = false, w = 480, h = 600 } = {}) {
  if (!src) return PLACEHOLDER_SVG;
  return `<img src="${esc(src)}" alt="${esc(name)}" width="${w}" height="${h}" decoding="async" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}>`;
}

function setBadge(p) {
  const n = (p.bundleItems || []).reduce((s, b) => s + b.qty, 0);
  return n ? `<span class="set-badge">SET OF ${n}</span>` : '';
}

function productCardHtml(p, index) {
  const out = p.stock <= 0;
  const img = imgHtml(p.imageThumb || p.image, p.name, { eager: index < 4 });
  return `<div class="card" data-id="${esc(p.id)}">
    <div class="thumb">
      ${p.compareAtPrice ? '<span class="tag-sale">SALE</span>' : ''}
      ${out ? '<span class="tag-out">Out of stock</span>' : ''}
      ${img}
      ${setBadge(p)}
    </div>
    <div class="card-body">
      <div class="cat">${esc(p.category)}</div>
      <h3>${esc(p.name)}</h3>
      <div class="price-row">
        ${p.compareAtPrice ? `<span class="old">${money(p.compareAtPrice)}</span>` : ''}
        <span class="price">${money(p.price)}</span>
      </div>
      <button class="addbtn" ${out ? 'disabled' : ''}>${out ? 'Unavailable' : 'View Product'}</button>
    </div>
  </div>`;
}

function renderGrid() {
  const grid = document.getElementById('grid');
  if (!state.loaded) return;
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const sort = document.getElementById('sortSelect').value;
  let list = state.all.filter(p => (state.category === 'All' || p.category === state.category) && (!q || p.name.toLowerCase().includes(q)));
  if (sort === 'low') list = [...list].sort((a, b) => a.price - b.price);
  if (sort === 'high') list = [...list].sort((a, b) => b.price - a.price);
  grid.innerHTML = list.length
    ? list.map(productCardHtml).join('')
    : '<div class="empty-state">No fragrances match your search.</div>';
  grid.querySelectorAll('.card').forEach(card => card.onclick = () => PDP.open(card.dataset.id));
}

async function loadProducts() {
  const grid = document.getElementById('grid');
  if (!state.loaded) {
    grid.innerHTML = Array(8).fill('<div class="card"><div class="thumb skeleton"></div><div class="card-body"><div class="skeleton" style="height:12px;width:60%"></div></div></div>').join('');
  }
  try {
    state.all = await api('/api/products');
    state.loaded = true;
    // Drop anything in the bag that's no longer sold
    const before = state.cart.length;
    state.cart = state.cart.filter(l => findProduct(l.id));
    if (state.cart.length !== before) saveCart();
    renderGrid();
    if (document.getElementById('cartSheet').classList.contains('show')) Cart.render();
  } catch (e) {
    if (!state.loaded) grid.innerHTML = '<div class="empty-state">Could not load products. Please try again shortly.</div>';
  }
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
document.getElementById('searchInput').addEventListener('input', debounce(renderGrid, 120));
document.getElementById('sortSelect').addEventListener('change', renderGrid);

// ---------------- Product Detail ----------------
function insideHtml(p) {
  const items = p.bundleItems || [];
  if (!items.length) return '';
  const separately = items.reduce((s, b) => s + b.price * b.qty, 0);
  const saving = separately - p.price;
  return `<div class="inside">
    <h4>What's inside</h4>
    ${items.map(b => `<div class="inside-row">
      <div class="mini">${b.image ? `<img src="${esc(b.image)}" alt="" width="46" height="46" loading="lazy" decoding="async">` : PLACEHOLDER_SVG}</div>
      <div class="nm">${esc(b.name)}<small>${esc(b.category)}</small></div>
      <div class="q">× ${b.qty}</div>
    </div>`).join('')}
    ${saving > 0 ? `<div class="saving">Worth ${money(separately)} if bought separately — you save ${money(saving)}</div>` : ''}
  </div>`;
}

const PDP = {
  open(id) {
    const p = findProduct(id);
    if (!p) return;
    document.getElementById('pdpBody').innerHTML = `
      <div class="pdp-img">${imgHtml(p.image || p.imageThumb, p.name, { eager: true, w: 1200, h: 1200 })}</div>
      <div style="margin-top:18px">
        <div class="cat">${esc(p.category)}</div>
        <h2 class="serif" style="font-size:1.6rem;margin:6px 0">${esc(p.name)}</h2>
        <div class="price-row" style="font-size:1.1rem">
          ${p.compareAtPrice ? `<span class="old">${money(p.compareAtPrice)}</span>` : ''}
          <span class="price">${money(p.price)}</span>
        </div>
        <p style="color:var(--muted);margin-top:14px;line-height:1.6;font-size:.9rem">${esc(p.description || '')}</p>
        ${insideHtml(p)}
        <p style="color:var(--muted);margin-top:14px;font-size:.78rem">${p.stock > 0 ? (p.stock <= 5 ? 'Only ' + p.stock + ' left' : 'In stock') : 'Currently out of stock'}</p>
        <button class="btn-primary" style="margin-top:16px" ${p.stock <= 0 ? 'disabled' : ''} onclick="Cart.add('${esc(p.id)}')">Add to Bag</button>
      </div>`;
    document.getElementById('pdpOverlay').classList.add('show');
    document.getElementById('pdpSheet').classList.add('show');
  },
  close() {
    document.getElementById('pdpOverlay').classList.remove('show');
    document.getElementById('pdpSheet').classList.remove('show');
  }
};
document.getElementById('pdpOverlay').onclick = PDP.close;

// ---------------- Cart ----------------
const Cart = {
  add(id) {
    const p = findProduct(id);
    if (!p) return;
    const line = state.cart.find(c => c.id === id);
    const have = line ? line.qty : 0;
    if (have >= p.stock) { toast(`Only ${p.stock} available`); return; }
    if (line) line.qty++; else state.cart.push({ id, qty: 1 });
    saveCart();
    toast('Added to your bag');
    PDP.close();
    Cart.open();
  },
  changeQty(id, d) {
    const line = state.cart.find(c => c.id === id);
    const p = findProduct(id);
    if (!line) return;
    if (d > 0 && p && line.qty >= p.stock) { toast(`Only ${p.stock} available`); return; }
    line.qty += d;
    if (line.qty <= 0) state.cart = state.cart.filter(c => c.id !== id);
    saveCart();
    Cart.render();
  },
  subtotal() {
    return state.cart.reduce((s, c) => { const p = findProduct(c.id); return s + (p ? p.price * c.qty : 0); }, 0);
  },
  render() {
    const body = document.getElementById('cartBody');
    const foot = document.getElementById('cartFoot');
    if (state.cart.length === 0) {
      body.innerHTML = '<p style="color:var(--muted)">Your bag is empty.</p>';
      foot.innerHTML = '';
      return;
    }
    body.innerHTML = state.cart.map(c => {
      const p = findProduct(c.id);
      if (!p) return '';
      const inside = (p.bundleItems || []).map(b => `${b.qty}× ${b.name}`).join(', ');
      return `<div class="cartline">
        <div class="thumb2">${imgHtml(p.imageThumb || p.image, '', { w: 56, h: 56 })}</div>
        <div class="info">
          <b>${esc(p.name)}</b>
          <div class="muted">${money(p.price)}</div>
          ${inside ? `<div class="cart-inside">${esc(inside)}</div>` : ''}
          <div class="remove-line" onclick="Cart.changeQty('${esc(c.id)}', -${c.qty})">Remove</div>
        </div>
        <div class="qty">
          <button onclick="Cart.changeQty('${esc(c.id)}', -1)">−</button>${c.qty}<button onclick="Cart.changeQty('${esc(c.id)}', 1)">+</button>
        </div>
      </div>`;
    }).join('');
    foot.innerHTML = `
      <div class="total-row grand"><span>Subtotal</span><span>${money(Cart.subtotal())}</span></div>
      <button class="btn-primary" onclick="Checkout.open()">Checkout</button>`;
  },
  open() {
    Cart.render();
    document.getElementById('cartOverlay').classList.add('show');
    document.getElementById('cartSheet').classList.add('show');
  },
  close() {
    document.getElementById('cartOverlay').classList.remove('show');
    document.getElementById('cartSheet').classList.remove('show');
  }
};
document.getElementById('cartOverlay').onclick = Cart.close;

// ---------------- Checkout ----------------
function cityList() {
  const fromSettings = state.settings && state.settings.cityFees ? Object.keys(state.settings.cityFees) : [];
  const list = fromSettings.length ? fromSettings : ['Casablanca', 'Rabat', 'Marrakech', 'Fes', 'Tangier', 'Agadir'];
  return [...new Set([...list, 'Other'])];
}

const Checkout = {
  open() {
    if (state.cart.length === 0) return;
    Cart.close();
    const sel = document.getElementById('cCity');
    sel.innerHTML = cityList().map(c => `<option>${esc(c)}</option>`).join('');
    sel.onchange = Checkout.updateTotals;
    Checkout.updateTotals();
    document.getElementById('coOverlay').classList.add('show');
    document.getElementById('coSheet').classList.add('show');
  },
  close() {
    document.getElementById('coOverlay').classList.remove('show');
    document.getElementById('coSheet').classList.remove('show');
  },
  feeFor(city, subtotal) {
    if (!state.settings) return 0;
    if (subtotal >= state.settings.freeDeliveryThreshold) return 0;
    return state.settings.cityFees[city] ?? state.settings.deliveryDefault;
  },
  updateTotals() {
    const city = document.getElementById('cCity').value || cityList()[0];
    const sub = Cart.subtotal();
    const fee = Checkout.feeFor(city, sub);
    document.getElementById('coTotals').innerHTML = `
      <div class="total-row"><span>Subtotal</span><span>${money(sub)}</span></div>
      <div class="total-row"><span>Delivery</span><span>${fee === 0 ? 'Free' : money(fee)}</span></div>
      <div class="total-row grand"><span>Total</span><span>${money(sub + fee)}</span></div>`;
  }
};
document.getElementById('coOverlay').onclick = Checkout.close;

document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Placing order...';
  try {
    const result = await postJson('/api/orders', {
      name: document.getElementById('cName').value,
      phone: document.getElementById('cPhone').value,
      city: document.getElementById('cCity').value,
      address: document.getElementById('cAddress').value,
      hp_check: document.getElementById('cHp').value,
      items: state.cart.map(c => ({ productId: c.id, qty: c.qty }))
    });
    state.cart = [];
    saveCart();
    Checkout.close();
    const wa = shopWhatsAppLink(`Hello Maison Bennani, I just placed order ${result.orderId}.`);
    document.getElementById('pdpBody').innerHTML = `<div style="text-align:center;padding:30px 10px">
      <h2 class="serif" style="color:var(--gold-soft);font-size:1.8rem">Order Confirmed</h2>
      <p style="color:var(--muted);margin-top:10px;line-height:1.6">Order <b>${esc(result.orderId)}</b> — total ${money(result.total)}.<br>Pay by Cash on Delivery. We'll contact you on WhatsApp to confirm your delivery.</p>
      ${wa ? `<a class="btn-primary" style="display:block;margin-top:18px;padding:14px" href="${esc(wa)}" target="_blank" rel="noopener">Message us on WhatsApp</a>` : ''}
    </div>`;
    document.getElementById('pdpOverlay').classList.add('show');
    document.getElementById('pdpSheet').classList.add('show');
    e.target.reset();
    loadProducts(); // stock has changed
  } catch (err) {
    toast(err.message || 'Could not place order');
    loadProducts();
  } finally {
    btn.disabled = false; btn.textContent = 'Confirm Order';
  }
});


// ---------------- Landing question ----------------
function initLandingPicker() {
  const picker = document.getElementById('landingPicker');
  const dismiss = (category) => {
    try { sessionStorage.setItem('mb_landing_seen', '1'); } catch (e) {}
    document.documentElement.classList.add('seen');
    picker.classList.add('hide');
    if (category) setCategory(category);
  };
  document.querySelectorAll('.landing-btn').forEach(btn => { btn.onclick = () => dismiss(btn.dataset.cat); });
  document.getElementById('landingSkip').onclick = () => dismiss(null);
}

// ---------------- WhatsApp buttons ----------------
function applyWhatsApp() {
  const link = shopWhatsAppLink('Hello Maison Bennani, I have a question.');
  for (const id of ['waFloat', 'waBoutique']) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (link) { el.href = link; el.hidden = false; } else { el.hidden = true; }
  }
}

// ---------------- Start ----------------
function init() {
  initLandingPicker();
  renderCategoryNav();
  updateCartCount();
  loadProducts(); // starts right away, alongside the settings request below

  api('/api/settings').then(s => {
    state.settings = s;
    applyWhatsApp();
    renderGrid(); // currency formatting
  }).catch(() => {
    state.settings = { currency: 'DH', deliveryDefault: 35, freeDeliveryThreshold: 600, cityFees: {} };
  });
}
init();

document.getElementById('year').textContent = new Date().getFullYear();

const PLACEHOLDER_SVG = `<svg class="placeholder-bottle" viewBox="0 0 100 160" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="38" y="10" width="24" height="16" rx="3" fill="#c9a24b" opacity=".55"/>
<rect x="42" y="4" width="16" height="10" rx="2" fill="#c9a24b" opacity=".7"/>
<path d="M30 30h40l6 20v96a8 8 0 0 1-8 8H32a8 8 0 0 1-8-8V50l6-20z" stroke="#c9a24b" stroke-width="2" opacity=".65"/>
<rect x="26" y="70" width="48" height="70" rx="4" fill="#c9a24b" opacity=".12"/>
</svg>`;

let state = {
  products: [],
  settings: null,
  category: 'All',
  customer: null,
  cart: JSON.parse(localStorage.getItem('mb_cart') || '[]')
};

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function money(n) { return `${n.toLocaleString()} ${state.settings ? state.settings.currency : 'DH'}`; }

function saveCart() { localStorage.setItem('mb_cart', JSON.stringify(state.cart)); updateCartCount(); }
function updateCartCount() {
  document.getElementById('cartCount').textContent = state.cart.reduce((s, c) => s + c.qty, 0);
}

function renderCategoryNav() {
  const cats = ['All', 'Men', 'Women', 'Gift Sets'];
  document.getElementById('catNav').innerHTML = cats.map(c =>
    `<button class="${c === state.category ? 'active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');
  document.querySelectorAll('#catNav button').forEach(b => b.onclick = () => {
    state.category = b.dataset.cat;
    document.getElementById('sectionTitle').textContent = state.category === 'All' ? 'All Fragrances' : state.category;
    loadProducts();
  });
}

function productCardHtml(p) {
  const out = p.stock <= 0;
  const img = p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}">` : PLACEHOLDER_SVG;
  return `<div class="card" data-id="${p.id}">
    <div class="thumb">
      ${p.compareAtPrice ? '<span class="tag-sale">SALE</span>' : ''}
      ${out ? '<span class="tag-out">Out of stock</span>' : ''}
      ${img}
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

async function loadProducts() {
  const grid = document.getElementById('grid');
  grid.innerHTML = Array(8).fill('<div class="card"><div class="thumb skeleton"></div><div class="card-body"><div class="skeleton" style="height:12px;width:60%"></div></div></div>').join('');
  const q = document.getElementById('searchInput').value.trim();
  const sort = document.getElementById('sortSelect').value;
  const params = new URLSearchParams();
  if (state.category !== 'All') params.set('category', state.category);
  if (q) params.set('q', q);
  if (sort) params.set('sort', sort);
  try {
    const list = await api('/api/products?' + params.toString());
    state.products = list;
    grid.innerHTML = list.length
      ? list.map(productCardHtml).join('')
      : '<div class="empty-state">No fragrances match your search.</div>';
    grid.querySelectorAll('.card').forEach(card => card.onclick = () => PDP.open(card.dataset.id));
  } catch (e) {
    grid.innerHTML = '<div class="empty-state">Could not load products. Please try again shortly.</div>';
  }
}

document.getElementById('searchInput').addEventListener('input', debounce(loadProducts, 250));
document.getElementById('sortSelect').addEventListener('change', loadProducts);
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---------------- Product Detail ----------------
const PDP = {
  open(id) {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    const img = p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}">` : PLACEHOLDER_SVG;
    document.getElementById('pdpBody').innerHTML = `
      <div class="pdp-img">${img}</div>
      <div style="margin-top:18px">
        <div class="cat">${esc(p.category)}</div>
        <h2 class="serif" style="font-size:1.6rem;margin:6px 0">${esc(p.name)}</h2>
        <div class="price-row" style="font-size:1.1rem">
          ${p.compareAtPrice ? `<span class="old">${money(p.compareAtPrice)}</span>` : ''}
          <span class="price">${money(p.price)}</span>
        </div>
        <p style="color:var(--muted);margin-top:14px;line-height:1.6;font-size:.9rem">${esc(p.description || '')}</p>
        <p style="color:var(--muted);margin-top:10px;font-size:.78rem">${p.stock > 0 ? p.stock + ' in stock' : 'Currently out of stock'}</p>
        <button class="btn-primary" style="margin-top:20px" ${p.stock <= 0 ? 'disabled' : ''} onclick="Cart.add('${p.id}')">Add to Bag</button>
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
    const line = state.cart.find(c => c.id === id);
    if (line) line.qty++; else state.cart.push({ id, qty: 1 });
    saveCart();
    toast('Added to your bag');
    PDP.close();
    Cart.open();
  },
  changeQty(id, d) {
    const line = state.cart.find(c => c.id === id);
    if (!line) return;
    line.qty += d;
    if (line.qty <= 0) state.cart = state.cart.filter(c => c.id !== id);
    saveCart();
    Cart.render();
  },
  subtotal() {
    return state.cart.reduce((s, c) => {
      const p = state.products.find(x => x.id === c.id);
      return s + (p ? p.price * c.qty : 0);
    }, 0);
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
      const p = state.products.find(x => x.id === c.id);
      if (!p) return '';
      const img = p.image ? `<img src="${esc(p.image)}" alt="">` : PLACEHOLDER_SVG;
      return `<div class="cartline">
        <div class="thumb2">${img}</div>
        <div class="info">
          <b>${esc(p.name)}</b>
          <div class="muted">${money(p.price)}</div>
          <div class="remove-line" onclick="Cart.changeQty('${c.id}', -${c.qty})">Remove</div>
        </div>
        <div class="qty">
          <button onclick="Cart.changeQty('${c.id}', -1)">−</button>${c.qty}<button onclick="Cart.changeQty('${c.id}', 1)">+</button>
        </div>
      </div>`;
    }).join('');
    foot.innerHTML = `
      <div class="total-row grand"><span>Subtotal</span><span>${money(Cart.subtotal())}</span></div>
      <button class="btn-primary" onclick="Checkout.open()">Checkout</button>`;
  },
  open() {
    Cart.render();
    // fetch missing product data (in case product list wasn't loaded yet)
    ensureCartProductsLoaded();
    document.getElementById('cartOverlay').classList.add('show');
    document.getElementById('cartSheet').classList.add('show');
  },
  close() {
    document.getElementById('cartOverlay').classList.remove('show');
    document.getElementById('cartSheet').classList.remove('show');
  }
};
document.getElementById('cartOverlay').onclick = Cart.close;

async function ensureCartProductsLoaded() {
  const missing = state.cart.filter(c => !state.products.find(p => p.id === c.id));
  if (missing.length === 0) return;
  try {
    const fetched = await Promise.all(missing.map(m => api('/api/products/' + m.id)));
    state.products.push(...fetched);
    Cart.render();
  } catch (e) { /* ignore */ }
}

// ---------------- Checkout ----------------
const CITIES = ['Casablanca', 'Rabat', 'Marrakech', 'Fes', 'Tangier', 'Agadir', 'Meknes', 'Oujda', 'Kenitra', 'Other'];

const Checkout = {
  open() {
    if (state.cart.length === 0) return;
    if (!state.customer) {
      Cart.close();
      toast('Please sign in or create an account to checkout');
      Account.open();
      return;
    }
    Cart.close();
    const sel = document.getElementById('cCity');
    sel.innerHTML = CITIES.map(c => `<option>${c}</option>`).join('');
    sel.onchange = Checkout.updateTotals;
    document.getElementById('cName').value = state.customer.name || '';
    document.getElementById('cPhone').value = state.customer.phone || '';
    document.getElementById('cEmail').value = state.customer.email || '';
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
    const city = document.getElementById('cCity').value || CITIES[0];
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
    const payload = {
      name: document.getElementById('cName').value,
      phone: document.getElementById('cPhone').value,
      city: document.getElementById('cCity').value,
      address: document.getElementById('cAddress').value,
      email: document.getElementById('cEmail').value || null,
      items: state.cart.map(c => ({ productId: c.id, qty: c.qty }))
    };
    const result = await api('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    state.cart = [];
    saveCart();
    Checkout.close();
    document.getElementById('pdpBody').innerHTML = `<div style="text-align:center;padding:30px 10px">
      <h2 class="serif" style="color:var(--gold-soft);font-size:1.8rem">Order Confirmed</h2>
      <p style="color:var(--muted);margin-top:10px">Order <b>${result.orderId}</b> — total ${money(result.total)}.<br>Pay by Cash on Delivery. We'll call to confirm shortly.</p>
    </div>`;
    document.getElementById('pdpOverlay').classList.add('show');
    document.getElementById('pdpSheet').classList.add('show');
    e.target.reset();
    loadProducts();
  } catch (err) {
    toast(err.message || 'Could not place order');
  } finally {
    btn.disabled = false; btn.textContent = 'Confirm Order';
  }
});

// ---------------- Account ----------------
const Account = {
  async open() {
    document.getElementById('acctOverlay').classList.add('show');
    document.getElementById('acctSheet').classList.add('show');
    await Account.refresh();
  },
  close() {
    document.getElementById('acctOverlay').classList.remove('show');
    document.getElementById('acctSheet').classList.remove('show');
  },
  async refresh() {
    try {
      const res = await api('/api/customers/me');
      state.customer = res.authenticated ? res.customer : null;
    } catch (e) { state.customer = null; }
    Account.render();
  },
  render() {
    document.getElementById('acctTitle').textContent = state.customer ? 'My Account' : 'Sign In';
    if (state.customer) {
      document.getElementById('acctBody').innerHTML = `
        <p style="color:var(--muted)">Signed in as</p>
        <p style="font-size:1.05rem;margin-bottom:18px"><b>${esc(state.customer.name)}</b><br>${esc(state.customer.email)}</p>
        <h3 class="serif" style="color:var(--gold-soft);margin-bottom:10px">My Orders</h3>
        <div id="myOrdersList"><p style="color:var(--muted)">Loading...</p></div>
        <button class="btn-ghost" onclick="Account.logout()">Log Out</button>`;
      Account.loadOrders();
    } else {
      document.getElementById('acctBody').innerHTML = `
        <form id="loginPane" onsubmit="return false">
          <label>Email</label><input id="loginEmail" type="email">
          <label>Password</label><input id="loginPassword" type="password">
          <div class="error-msg" id="loginErr" style="color:var(--danger);font-size:.8rem;margin-top:8px"></div>
          <button class="btn-primary" style="margin-top:16px" onclick="Account.login()" type="button">Sign In</button>
          <p style="text-align:center;margin-top:10px"><a href="#" style="color:var(--muted);font-size:.78rem" onclick="Account.forgotPassword();return false">Forgot password?</a></p>
          <p style="color:var(--muted);font-size:.82rem;margin-top:16px;text-align:center">No account yet? <a href="#" style="color:var(--gold-soft)" onclick="Account.showRegister();return false">Create one</a></p>
        </form>
        <form id="registerPane" style="display:none" onsubmit="return false">
          <label>Full name</label><input id="regName">
          <label>Email</label><input id="regEmail" type="email">
          <label>Phone</label><input id="regPhone" type="tel">
          <label>Password (min 6 characters)</label><input id="regPassword" type="password">
          <div class="error-msg" id="regErr" style="color:var(--danger);font-size:.8rem;margin-top:8px"></div>
          <button class="btn-primary" style="margin-top:16px" onclick="Account.register()" type="button">Create Account</button>
          <p style="color:var(--muted);font-size:.82rem;margin-top:16px;text-align:center">Already have an account? <a href="#" style="color:var(--gold-soft)" onclick="Account.showLogin();return false">Sign in</a></p>
        </form>`;
    }
  },
  showRegister() { document.getElementById('loginPane').style.display = 'none'; document.getElementById('registerPane').style.display = 'block'; },
  showLogin() { document.getElementById('registerPane').style.display = 'none'; document.getElementById('loginPane').style.display = 'block'; },
  async login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    try {
      await api('/api/customers/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      toast('Welcome back!');
      await Account.refresh();
      if (state.cart.length > 0) { Account.close(); Checkout.open(); }
    } catch (err) { document.getElementById('loginErr').textContent = err.message; }
  },
  async forgotPassword() {
    const email = document.getElementById('loginEmail').value;
    if (!email) { document.getElementById('loginErr').textContent = 'Enter your email above first, then click "Forgot password?"'; return; }
    try {
      const res = await api('/api/customers/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      toast(res.message);
    } catch (err) { toast(err.message); }
  },
  async register() {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const phone = document.getElementById('regPhone').value;
    const password = document.getElementById('regPassword').value;
    try {
      await api('/api/customers/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, phone, password }) });
      toast('Account created!');
      await Account.refresh();
      if (state.cart.length > 0) { Account.close(); Checkout.open(); }
    } catch (err) { document.getElementById('regErr').textContent = err.message; }
  },
  async logout() {
    await api('/api/customers/logout', { method: 'POST' });
    state.customer = null;
    toast('Signed out');
    Account.render();
  },
  async loadOrders() {
    try {
      const orders = await api('/api/customers/my-orders');
      const list = document.getElementById('myOrdersList');
      if (!list) return;
      list.innerHTML = orders.length ? orders.map(o => `
        <div style="border:1px solid var(--line);border-radius:8px;padding:12px;margin-bottom:10px;font-size:.85rem">
          <div style="display:flex;justify-content:space-between"><b>${o.id}</b><span style="color:var(--gold-soft)">${o.status}</span></div>
          <div style="color:var(--muted);margin-top:6px">${o.items.map(i => i.qty + '× ' + esc(i.name)).join(', ')}</div>
          <div style="margin-top:6px">${money(o.total)} · ${new Date(o.createdAt).toLocaleDateString()}</div>
        </div>`).join('') : '<p style="color:var(--muted)">No orders yet.</p>';
    } catch (e) { /* ignore */ }
  }
};
document.getElementById('acctOverlay').onclick = Account.close;

// ---------------- Init ----------------
async function init() {
  renderCategoryNav();
  updateCartCount();
  try {
    state.settings = await api('/api/settings');
  } catch (e) {
    state.settings = { currency: 'DH', deliveryDefault: 35, freeDeliveryThreshold: 600, cityFees: {} };
  }
  try {
    const me = await api('/api/customers/me');
    state.customer = me.authenticated ? me.customer : null;
  } catch (e) { state.customer = null; }
  loadProducts();
}
init();

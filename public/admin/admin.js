let productsCache = [];
let ordersCache = [];
let customersCache = [];
let settingsCache = null;
let lastReset = null; // the most recent temporary password, shown until you leave the tab

// Escapes text for safe use inside HTML (including inside "quoted" attributes). Order fields come
// straight from customers at checkout, so they must never be treated as raw HTML.
function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
const sendJson = (method, path, body) => api(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Moroccan numbers typed locally (06…) become international (212…) so WhatsApp links work.
function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = '212' + d.slice(1);
  else if (d.length === 9 && /^[5-8]/.test(d)) d = '212' + d;
  return d.length >= 8 && d.length <= 15 ? d : '';
}
function waLink(phone, text) {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : '';
}
function waButton(phone, text, label = 'WhatsApp') {
  const href = waLink(phone, text);
  return href ? `<a class="wa-btn" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>` : '';
}

// ---------------- Auth ----------------
async function checkAuth() {
  const me = await api('/api/auth/me');
  if (me.authenticated) {
    document.getElementById('loginWrap').style.display = 'none';
    document.getElementById('app').classList.add('show');
    document.getElementById('whoAmI').textContent = 'Signed in as ' + me.username;
    setTab('products');
  } else {
    document.getElementById('loginWrap').style.display = 'flex';
    document.getElementById('app').classList.remove('show');
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUser').value;
  const password = document.getElementById('loginPass').value;
  const totpCode = document.getElementById('loginTotp').value;
  document.getElementById('loginError').textContent = '';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, totpCode })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.requiresTotp) {
        document.getElementById('totpField').style.display = 'block';
        document.getElementById('loginError').textContent = 'Enter the 6-digit code from your authenticator app.';
        document.getElementById('loginTotp').focus();
        return;
      }
      throw new Error(data.error || 'Login failed');
    }
    checkAuth();
  } catch (err) {
    document.getElementById('loginError').textContent = err.message;
  }
});

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  checkAuth();
}

// ---------------- Tabs ----------------
document.querySelectorAll('.tabs button[data-tab]').forEach(btn => { btn.onclick = () => setTab(btn.dataset.tab); });
function setTab(tab) {
  document.querySelectorAll('.tabs button[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab !== 'customers') lastReset = null;
  if (tab === 'products') loadProducts();
  if (tab === 'orders') loadOrders();
  if (tab === 'customers') loadCustomers();
  if (tab === 'settings') loadSettings();
}

// ---------------- Products ----------------
async function loadProducts() {
  const content = document.getElementById('content');
  content.innerHTML = '<p class="empty">Loading products...</p>';
  try {
    productsCache = await api('/api/products/admin/all');
    renderProducts();
  } catch (e) { content.innerHTML = '<p class="empty">Could not load products.</p>'; }
}

function isSet(p) { return Array.isArray(p.bundle) && p.bundle.length > 0; }

function renderProducts() {
  document.getElementById('content').innerHTML = `
    <div class="bar">
      <div><strong>${productsCache.length}</strong> products</div>
      <button class="btn" onclick="openProductModal()">+ Add Product</button>
    </div>
    <div class="filters">
      <input id="prodSearch" placeholder="Search products..." oninput="renderProductRows()">
      <select id="prodCat" onchange="renderProductRows()">
        <option value="">All categories</option><option>Men</option><option>Women</option><option>Gift Sets</option>
      </select>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead>
        <tbody id="prodBody"></tbody>
      </table>
    </div>`;
  renderProductRows();
}

function renderProductRows() {
  const q = (document.getElementById('prodSearch').value || '').trim().toLowerCase();
  const cat = document.getElementById('prodCat').value;
  const list = productsCache.filter(p => (!cat || p.category === cat) && (!q || p.name.toLowerCase().includes(q)));
  document.getElementById('prodBody').innerHTML = list.map(p => {
    const stock = isSet(p) ? p.availableStock : p.stock;
    const thumb = p.imageThumb || p.image;
    const n = isSet(p) ? p.bundle.reduce((s, b) => s + b.qty, 0) : 0;
    return `<tr>
      <td>${thumb ? `<img class="thumb-sm" src="${esc(thumb)}" alt="" loading="lazy" width="42" height="42">` : '<div class="thumb-sm"></div>'}</td>
      <td>${esc(p.name)}${!p.active ? ' <span class="pill cancelled">Hidden</span>' : ''}${isSet(p) ? `<br><span class="sub">Set of ${n} perfume${n === 1 ? '' : 's'}</span>` : ''}</td>
      <td>${esc(p.category)}</td>
      <td>${p.price} DH${p.compareAtPrice ? ` <s style="color:var(--muted)">${p.compareAtPrice}</s>` : ''}</td>
      <td class="${stock <= 3 ? 'stock-low' : ''}">${stock}${isSet(p) ? '<br><span class="sub">sets</span>' : ''}</td>
      <td class="row-actions">
        <button onclick="openProductModal('${esc(p.id)}')">Edit</button>
        <button onclick="deleteProduct('${esc(p.id)}')" style="border-color:var(--danger);color:var(--danger)">Delete</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">No products found.</td></tr>';
}

// ----- Gift set builder -----
let bundleSel = new Map(); // perfume id -> how many of it are in the set

function renderBundlePicker() {
  const q = (document.getElementById('bundleSearch').value || '').trim().toLowerCase();
  const own = document.getElementById('pfId').value;
  const list = productsCache.filter(p => p.category !== 'Gift Sets' && p.id !== own && (!q || p.name.toLowerCase().includes(q)));
  document.getElementById('bundleList').innerHTML = list.map(p => {
    const on = bundleSel.has(p.id);
    return `<div class="bundle-row">
      <label class="bl"><input type="checkbox" data-pick="${esc(p.id)}" ${on ? 'checked' : ''}>
        <span>${esc(p.name)}<small>${esc(p.category)} · ${p.price} DH · ${p.stock} in stock</small></span></label>
      <input class="bq" type="number" min="1" max="10" value="${bundleSel.get(p.id) || 1}" data-qty="${esc(p.id)}" ${on ? '' : 'disabled'} aria-label="Quantity">
    </div>`;
  }).join('') || '<p class="empty" style="padding:14px 0">No perfumes found. Add Men / Women perfumes first.</p>';
  updateBundleSummary();
}

function updateBundleSummary() {
  const stockInput = document.getElementById('pfStock');
  const hint = document.getElementById('pfStockHint');
  let total = 0, sets = Infinity;
  for (const [id, qty] of bundleSel) {
    const p = productsCache.find(x => x.id === id);
    if (!p) continue;
    total += p.price * qty;
    sets = Math.min(sets, Math.floor(p.stock / qty));
  }
  if (bundleSel.size === 0) {
    document.getElementById('bundleSummary').innerHTML = '<span class="sub">No perfumes selected yet.</span>';
    stockInput.disabled = false;
    hint.textContent = '';
    return;
  }
  document.getElementById('bundleSummary').innerHTML =
    `<b>${[...bundleSel.values()].reduce((a, b) => a + b, 0)}</b> perfume(s) selected · worth <b>${total} DH</b> separately
     <button type="button" class="btn secondary small" onclick="document.getElementById('pfCompareAt').value=${total}">Use as "compare-at" price</button>`;
  stockInput.disabled = true;
  hint.textContent = `Stock is automatic: ${isFinite(sets) ? sets : 0} complete set(s) available, based on the perfumes' own stock.`;
}

document.getElementById('bundleList').addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.pick) {
    const qtyInput = t.closest('.bundle-row').querySelector('.bq');
    if (t.checked) { bundleSel.set(t.dataset.pick, Math.max(1, parseInt(qtyInput.value, 10) || 1)); qtyInput.disabled = false; }
    else { bundleSel.delete(t.dataset.pick); qtyInput.disabled = true; }
  } else if (t.dataset.qty) {
    const q = Math.min(10, Math.max(1, parseInt(t.value, 10) || 1));
    t.value = q;
    if (bundleSel.has(t.dataset.qty)) bundleSel.set(t.dataset.qty, q);
  }
  updateBundleSummary();
});
document.getElementById('bundleSearch').addEventListener('input', renderBundlePicker);

function syncCategoryUI() {
  const isGift = document.getElementById('pfCategory').value === 'Gift Sets';
  document.getElementById('bundleSection').style.display = isGift ? 'block' : 'none';
  if (isGift) renderBundlePicker();
  else { document.getElementById('pfStock').disabled = false; document.getElementById('pfStockHint').textContent = ''; }
}
document.getElementById('pfCategory').addEventListener('change', syncCategoryUI);

function openProductModal(id) {
  document.getElementById('productForm').reset();
  document.getElementById('pfPreview').style.display = 'none';
  document.getElementById('bundleSearch').value = '';
  bundleSel = new Map();
  if (id) {
    const p = productsCache.find(x => x.id === id);
    document.getElementById('productModalTitle').textContent = 'Edit Product';
    document.getElementById('pfId').value = p.id;
    document.getElementById('pfName').value = p.name;
    document.getElementById('pfCategory').value = p.category;
    document.getElementById('pfPrice').value = p.price;
    document.getElementById('pfCompareAt').value = p.compareAtPrice || '';
    document.getElementById('pfStock').value = p.stock;
    document.getElementById('pfDescription').value = p.description || '';
    document.getElementById('pfActive').checked = p.active;
    (p.bundle || []).forEach(b => bundleSel.set(b.productId, b.qty));
    const thumb = p.imageThumb || p.image;
    if (thumb) { document.getElementById('pfPreview').src = thumb; document.getElementById('pfPreview').style.display = 'block'; }
  } else {
    document.getElementById('productModalTitle').textContent = 'Add Product';
    document.getElementById('pfId').value = '';
    document.getElementById('pfActive').checked = true;
  }
  syncCategoryUI();
  document.getElementById('productModalOverlay').classList.add('show');
}
function closeProductModal() { document.getElementById('productModalOverlay').classList.remove('show'); }

document.getElementById('pfImage').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const preview = document.getElementById('pfPreview');
  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
});

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('pfId').value;
  const category = document.getElementById('pfCategory').value;
  const fd = new FormData();
  fd.append('name', document.getElementById('pfName').value);
  fd.append('category', category);
  fd.append('price', document.getElementById('pfPrice').value);
  fd.append('compareAtPrice', document.getElementById('pfCompareAt').value);
  if (!document.getElementById('pfStock').disabled) fd.append('stock', document.getElementById('pfStock').value);
  fd.append('description', document.getElementById('pfDescription').value);
  fd.append('active', document.getElementById('pfActive').checked);
  fd.append('bundle', JSON.stringify(category === 'Gift Sets' ? [...bundleSel].map(([productId, qty]) => ({ productId, qty })) : []));
  const file = document.getElementById('pfImage').files[0];
  if (file) fd.append('image', file);

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = file ? 'Optimizing photo...' : 'Saving...';
  try {
    if (id) { await api('/api/products/admin/' + id, { method: 'PUT', body: fd }); toast('Product updated'); }
    else { await api('/api/products/admin', { method: 'POST', body: fd }); toast('Product added'); }
    closeProductModal();
    loadProducts();
  } catch (err) { toast(err.message); }
  finally { btn.disabled = false; btn.textContent = 'Save Product'; }
});

async function deleteProduct(id) {
  if (!confirm('Delete this product permanently?')) return;
  try {
    await api('/api/products/admin/' + id, { method: 'DELETE' });
    toast('Product deleted');
    loadProducts();
  } catch (err) { toast(err.message); }
}

// ---------------- Orders ----------------
const STATUSES = ['New', 'Confirmed', 'Preparing', 'Shipped', 'Delivered', 'Cancelled'];

function orderMessage(o) {
  const id = o.id, total = `${o.total} DH`;
  const line = {
    New: `We received your order ${id} (${total}, Cash on Delivery). Could you confirm your delivery address and a good time for delivery?`,
    Confirmed: `Your order ${id} is confirmed. Total to pay on delivery: ${total}.`,
    Preparing: `We are preparing your order ${id}.`,
    Shipped: `Your order ${id} is on its way! Total to pay on delivery: ${total}.`,
    Delivered: `Thank you for your order ${id}! We hope you love it.`,
    Cancelled: `Your order ${id} has been cancelled. Message us if you have any questions.`
  }[o.status] || `About your order ${id}.`;
  return `Hello ${o.name}, this is Maison Bennani. ${line}`;
}

async function loadOrders() {
  const content = document.getElementById('content');
  content.innerHTML = '<p class="empty">Loading orders...</p>';
  try {
    ordersCache = await api('/api/orders/admin/all');
    renderOrders();
  } catch (e) { content.innerHTML = '<p class="empty">Could not load orders.</p>'; }
}

function renderOrders() {
  const content = document.getElementById('content');
  if (ordersCache.length === 0) {
    content.innerHTML = '<p class="empty">No orders yet. Orders placed on the storefront will appear here.</p>';
    return;
  }
  const fresh = ordersCache.filter(o => o.status === 'New').length;
  content.innerHTML = `
    <div class="bar">
      <div><strong>${ordersCache.length}</strong> orders · <strong>${fresh}</strong> new</div>
      <select id="orderFilter" onchange="renderOrderRows()">
        <option value="">All statuses</option>${STATUSES.map(s => `<option>${s}</option>`).join('')}
      </select>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Order</th><th>Customer</th><th>Address</th><th>Items</th><th>Total</th><th>Date</th><th>Status</th></tr></thead>
        <tbody id="orderBody"></tbody>
      </table>
    </div>`;
  renderOrderRows();
}

function renderOrderRows() {
  const f = document.getElementById('orderFilter').value;
  const list = ordersCache.filter(o => !f || o.status === f);
  document.getElementById('orderBody').innerHTML = list.map(o => `
    <tr>
      <td>${esc(o.id)}</td>
      <td>${esc(o.name)}<br><span class="sub">${esc(o.phone)}</span><br>${waButton(o.phone, orderMessage(o))}</td>
      <td>${esc(o.address)}<br><span class="sub">${esc(o.city)}</span></td>
      <td>${o.items.map(i => `${i.qty}× ${esc(i.name)}${Array.isArray(i.bundle) ? `<br><span class="sub">${i.bundle.map(b => `${b.qty * i.qty}× ${esc(b.name)}`).join(', ')}</span>` : ''}`).join('<br>')}</td>
      <td>${o.total} DH</td>
      <td class="sub">${new Date(o.createdAt).toLocaleString()}</td>
      <td>
        <select onchange="updateStatus('${esc(o.id)}', this.value)">
          ${STATUSES.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty">No orders with that status.</td></tr>';
}

async function updateStatus(id, status) {
  try {
    const updated = await sendJson('PUT', '/api/orders/admin/' + id + '/status', { status });
    const i = ordersCache.findIndex(x => x.id === id);
    if (i >= 0) ordersCache[i] = updated;
    toast('Order status updated');
    renderOrders();
  } catch (err) {
    toast(err.message);
    loadOrders(); // put the dropdown back to the real status
  }
}

// ---------------- Customers ----------------
async function loadCustomers() {
  const content = document.getElementById('content');
  content.innerHTML = '<p class="empty">Loading customers...</p>';
  try {
    customersCache = await api('/api/customers/admin/all');
    renderCustomers();
  } catch (e) { content.innerHTML = '<p class="empty">Could not load customers.</p>'; }
}

function renderCustomers() {
  const reset = lastReset ? `
    <div class="notice">
      Temporary password for <b>${esc(lastReset.phone)}</b>: <code>${esc(lastReset.tempPassword)}</code>
      ${waButton(lastReset.phone, `Hello, this is Maison Bennani. Your temporary password is: ${lastReset.tempPassword}\nPlease sign in and change it from "My Account".`, 'Send on WhatsApp')}
      <div class="sub" style="margin-top:6px">Shown only now — it can't be looked up again. The customer should change it after signing in.</div>
    </div>` : '';
  document.getElementById('content').innerHTML = `
    ${reset}
    <div class="bar"><div><strong>${customersCache.length}</strong> customers</div></div>
    <p class="sub" style="margin-bottom:12px">Customers sign in with their phone number. If someone forgets their password, press <b>Reset password</b>, then send them the temporary one on WhatsApp.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Phone</th><th>Name</th><th>Orders</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>${customersCache.map(c => `<tr>
          <td>${esc(c.phone)}<br>${waButton(c.phone, 'Hello, this is Maison Bennani.')}</td>
          <td>${esc(c.name) || '<span class="sub">—</span>'}</td>
          <td>${c.orderCount}</td>
          <td class="sub">${new Date(c.createdAt).toLocaleDateString()}</td>
          <td class="row-actions"><button onclick="resetCustomerPassword('${esc(c.id)}')">Reset password</button></td>
        </tr>`).join('') || '<tr><td colspan="5" class="empty">No customers yet.</td></tr>'}</tbody>
      </table>
    </div>`;
}

async function resetCustomerPassword(id) {
  if (!confirm("Reset this customer's password? Their old password will stop working.")) return;
  try {
    lastReset = await api('/api/customers/admin/' + id + '/reset-password', { method: 'POST' });
    renderCustomers();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) { toast(err.message); }
}

// ---------------- Settings ----------------
async function loadSettings() {
  const content = document.getElementById('content');
  content.innerHTML = '<p class="empty">Loading settings...</p>';
  try {
    settingsCache = await api('/api/settings');
    renderSettings();
  } catch (e) { content.innerHTML = '<p class="empty">Could not load settings.</p>'; }
}

function renderSettings() {
  const s = settingsCache;
  const cities = Object.keys(s.cityFees);
  document.getElementById('content').innerHTML = `
    <h2 style="color:var(--gold-soft);margin-bottom:16px">Settings</h2>
    <div class="settings-grid">
      <div class="field">
        <label>Shop WhatsApp number (customers can message you from the site)</label>
        <input id="setWa" type="tel" value="${esc(s.whatsappNumber || '')}" placeholder="06XXXXXXXX or +212 6XX XXX XXX">
      </div>
      <div class="field"><label>Default delivery fee (DH)</label><input id="setDefault" type="number" value="${s.deliveryDefault}"></div>
      <div class="field"><label>Free delivery above (DH)</label><input id="setFree" type="number" value="${s.freeDeliveryThreshold}"></div>
      <div class="field">
        <label>Per-city delivery fees</label>
        <div id="cityFeesList">
          ${cities.map(c => `<div class="city-fee-row"><span>${esc(c)}</span><input type="number" data-city="${esc(c)}" value="${s.cityFees[c]}"></div>`).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <input id="newCityName" placeholder="Add city..." style="flex:1;padding:8px;background:#0e0d0c;border:1px solid var(--line);color:var(--cream);border-radius:6px">
          <button class="btn secondary" onclick="addCityRow()">Add</button>
        </div>
      </div>
      <button class="btn" onclick="saveSettings()">Save Settings</button>
    </div>`;
}

function addCityRow() {
  const name = document.getElementById('newCityName').value.trim();
  if (!name) return;
  const row = document.createElement('div');
  row.className = 'city-fee-row';
  row.innerHTML = `<span>${esc(name)}</span><input type="number" data-city="${esc(name)}" value="${settingsCache.deliveryDefault}">`;
  document.getElementById('cityFeesList').appendChild(row);
  document.getElementById('newCityName').value = '';
}

async function saveSettings() {
  const cityFees = {};
  document.querySelectorAll('#cityFeesList input').forEach(inp => { cityFees[inp.dataset.city] = parseFloat(inp.value) || 0; });
  try {
    settingsCache = await sendJson('PUT', '/api/settings', {
      whatsappNumber: document.getElementById('setWa').value,
      deliveryDefault: document.getElementById('setDefault').value,
      freeDeliveryThreshold: document.getElementById('setFree').value,
      cityFees
    });
    toast('Settings saved');
    renderSettings();
  } catch (err) { toast(err.message); }
}

checkAuth();

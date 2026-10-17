let currentTab = 'products';
let productsCache = [];
let ordersCache = [];
let settingsCache = null;

// Escapes any text before it's inserted into innerHTML. This matters most for
// order fields (name, phone, address, city) since those come directly from
// customers at checkout and must never be trusted as raw HTML.
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
  toast._t = setTimeout(() => el.classList.remove('show'), 2400);
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
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
  document.getElementById('loginError').textContent = '';
  try {
    await api('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
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
document.querySelectorAll('.tabs button[data-tab]').forEach(btn => {
  btn.onclick = () => setTab(btn.dataset.tab);
});
function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tabs button[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'products') loadProducts();
  if (tab === 'orders') loadOrders();
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

function renderProducts() {
  const content = document.getElementById('content');
  const rows = productsCache.map(p => `
    <tr>
      <td>${p.image ? `<img class="thumb-sm" src="${esc(p.image)}">` : '<div class="thumb-sm"></div>'}</td>
      <td>${esc(p.name)}${!p.active ? ' <span class="pill cancelled">Hidden</span>' : ''}</td>
      <td>${esc(p.category)}</td>
      <td>${p.price} DH${p.compareAtPrice ? ` <s style="color:var(--muted)">${p.compareAtPrice}</s>` : ''}</td>
      <td class="${p.stock <= 3 ? 'stock-low' : ''}">${p.stock}</td>
      <td class="row-actions">
        <button onclick="openProductModal('${p.id}')">Edit</button>
        <button onclick="deleteProduct('${p.id}')" style="border-color:var(--danger);color:var(--danger)">Delete</button>
      </td>
    </tr>`).join('');

  content.innerHTML = `
    <div class="bar">
      <div><strong>${productsCache.length}</strong> products</div>
      <button class="btn" onclick="openProductModal()">+ Add Product</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="empty">No products yet.</td></tr>'}</tbody>
      </table>
    </div>`;
}

function openProductModal(id) {
  const form = document.getElementById('productForm');
  form.reset();
  document.getElementById('pfPreview').style.display = 'none';
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
    if (p.image) {
      document.getElementById('pfPreview').src = p.image;
      document.getElementById('pfPreview').style.display = 'block';
    }
  } else {
    document.getElementById('productModalTitle').textContent = 'Add Product';
    document.getElementById('pfId').value = '';
    document.getElementById('pfActive').checked = true;
  }
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
  const fd = new FormData();
  fd.append('name', document.getElementById('pfName').value);
  fd.append('category', document.getElementById('pfCategory').value);
  fd.append('price', document.getElementById('pfPrice').value);
  fd.append('compareAtPrice', document.getElementById('pfCompareAt').value);
  fd.append('stock', document.getElementById('pfStock').value);
  fd.append('description', document.getElementById('pfDescription').value);
  fd.append('active', document.getElementById('pfActive').checked);
  const file = document.getElementById('pfImage').files[0];
  if (file) fd.append('image', file);

  try {
    if (id) {
      await api('/api/products/admin/' + id, { method: 'PUT', body: fd });
      toast('Product updated');
    } else {
      await api('/api/products/admin', { method: 'POST', body: fd });
      toast('Product added');
    }
    closeProductModal();
    loadProducts();
  } catch (err) { toast(err.message); }
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
  const rows = ordersCache.map(o => `
    <tr>
      <td>${esc(o.id)}</td>
      <td>${esc(o.name)}<br><span style="color:var(--muted);font-size:.78rem">${esc(o.phone)}</span></td>
      <td>${esc(o.address)}<br><span style="color:var(--muted);font-size:.78rem">${esc(o.city)}</span></td>
      <td>${o.items.map(i => `${i.qty}× ${esc(i.name)}`).join('<br>')}</td>
      <td>${o.total} DH</td>
      <td style="font-size:.78rem;color:var(--muted)">${new Date(o.createdAt).toLocaleString()}</td>
      <td>
        <select onchange="updateStatus('${o.id}', this.value)">
          ${STATUSES.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('');

  content.innerHTML = `
    <div class="bar"><div><strong>${ordersCache.length}</strong> orders</div></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Order</th><th>Customer</th><th>Address</th><th>Items</th><th>Total</th><th>Date</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function updateStatus(id, status) {
  try {
    await api('/api/orders/admin/' + id + '/status', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    toast('Order status updated');
    const o = ordersCache.find(x => x.id === id);
    if (o) o.status = status;
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
  const content = document.getElementById('content');
  const cities = Object.keys(s.cityFees);
  content.innerHTML = `
    <h2 style="color:var(--gold-soft);margin-bottom:16px">Delivery Settings</h2>
    <div class="settings-grid">
      <div class="field"><label>Default delivery fee (DH)</label><input id="setDefault" type="number" value="${s.deliveryDefault}"></div>
      <div class="field"><label>Free delivery above (DH)</label><input id="setFree" type="number" value="${s.freeDeliveryThreshold}"></div>
      <div class="field">
        <label>Per-city delivery fees</label>
        <div id="cityFeesList">
          ${cities.map(c => `<div class="city-fee-row"><span>${c}</span><input type="number" data-city="${c}" value="${s.cityFees[c]}"></div>`).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <input id="newCityName" placeholder="Add city..." style="flex:1;padding:8px;background:#0e0d0c;border:1px solid var(--line);color:var(--cream);border-radius:6px">
          <button class="btn secondary" onclick="addCityRow()">Add</button>
        </div>
      </div>
      <button class="btn" onclick="saveSettings()">Save Delivery Settings</button>
    </div>`;
}

function addCityRow() {
  const name = document.getElementById('newCityName').value.trim();
  if (!name) return;
  const list = document.getElementById('cityFeesList');
  const row = document.createElement('div');
  row.className = 'city-fee-row';
  row.innerHTML = `<span>${name}</span><input type="number" data-city="${name}" value="${settingsCache.deliveryDefault}">`;
  list.appendChild(row);
  document.getElementById('newCityName').value = '';
}

async function saveSettings() {
  const cityFees = {};
  document.querySelectorAll('#cityFeesList input').forEach(inp => {
    cityFees[inp.dataset.city] = parseFloat(inp.value) || 0;
  });
  try {
    settingsCache = await api('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deliveryDefault: document.getElementById('setDefault').value,
        freeDeliveryThreshold: document.getElementById('setFree').value,
        cityFees
      })
    });
    toast('Settings saved');
    renderSettings();
  } catch (err) { toast(err.message); }
}

checkAuth();

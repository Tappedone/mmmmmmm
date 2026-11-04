let productsCache = [];
let ordersCache = [];
let settingsCache = null;

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
let giftSetItems = []; // array of { productId, qty, price, product: {...} } in order

function getPerfumeById(id) {
  return productsCache.find(x => x.id === id);
}

function renderBundleSearch() {
  const input = document.getElementById('bundleSearch');
  const results = document.getElementById('bundleSearchResults');
  const q = (input.value || '').trim().toLowerCase();
  const own = document.getElementById('pfId').value;
  if (q.length === 0) {
    results.style.display = 'none';
    results.innerHTML = '';
    return;
  }
  const already = new Set(giftSetItems.map(i => i.productId));
  const list = productsCache.filter(p => p.category !== 'Gift Sets' && p.id !== own && !already.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, 10);
  if (list.length === 0) {
    results.innerHTML = '<div class="bundle-search-item" style="color:var(--muted)">No matches</div>';
    results.style.display = 'block';
    return;
  }
  results.innerHTML = list.map(p => {
    const thumb = p.imageThumb || p.image;
    return `<div class="bundle-search-item" data-add="${esc(p.id)}">
      ${thumb ? `<img src="${esc(thumb)}" alt="">` : '<div style="width:36px;height:36px;background:#222;border-radius:6px"></div>'}
      <div><div>${esc(p.name)}</div><div class="sub">${esc(p.category)} · ${p.price} DH</div></div>
    </div>`;
  }).join('');
  results.style.display = 'block';
}

function hideBundleSearch() {
  setTimeout(() => {
    document.getElementById('bundleSearchResults').style.display = 'none';
  }, 150);
}

function addPerfumeToGiftSet(productId) {
  const p = getPerfumeById(productId);
  if (!p) return;
  const existing = giftSetItems.find(i => i.productId === productId);
  if (existing) return;
  giftSetItems.push({
    productId: p.id,
    qty: 1,
    price: p.price,
    product: p
  });
  document.getElementById('bundleSearch').value = '';
  document.getElementById('bundleSearchResults').style.display = 'none';
  renderGiftSetSelected();
  updateBundleSummary();
}

function removePerfumeFromGiftSet(productId) {
  giftSetItems = giftSetItems.filter(i => i.productId !== productId);
  renderGiftSetSelected();
  updateBundleSummary();
}

function movePerfumeInGiftSet(productId, direction) {
  const idx = giftSetItems.findIndex(i => i.productId === productId);
  if (idx === -1) return;
  const newIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= giftSetItems.length) return;
  const [item] = giftSetItems.splice(idx, 1);
  giftSetItems.splice(newIdx, 0, item);
  renderGiftSetSelected();
  updateBundleSummary();
}

function updateGiftSetItem(productId, field, value) {
  const item = giftSetItems.find(i => i.productId === productId);
  if (!item) return;
  if (field === 'qty') {
    let q = parseInt(value, 10);
    if (isNaN(q) || q < 1) q = 1;
    if (q > 10) q = 10;
    item.qty = q;
  } else if (field === 'price') {
    let pr = parseFloat(value);
    if (isNaN(pr) || pr < 0) pr = 0;
    item.price = pr;
  }
  updateBundleSummary();
}

function renderGiftSetSelected() {
  const container = document.getElementById('bundleSelected');
  if (giftSetItems.length === 0) {
    container.innerHTML = '<p class="empty" style="padding:10px 0">No perfumes selected yet. Search and add perfumes above.</p>';
    return;
  }
  container.innerHTML = giftSetItems.map((item, idx) => {
    const p = item.product || getPerfumeById(item.productId) || {};
    const thumb = p.imageThumb || p.image;
    return `<div class="bundle-selected-item">
      <div class="bsi-header">
        <div class="bsi-info">
          ${thumb ? `<img src="${esc(thumb)}" alt="">` : '<div class="bsi-img-placeholder"></div>'}
          <div>
            <div class="bsi-name">${esc(p.name || item.productId)}</div>
            <div class="sub">${esc(p.category || '')} · Original: ${p.price || 0} DH</div>
          </div>
        </div>
        <div class="bsi-actions">
          <button type="button" class="btn small secondary" onclick="movePerfumeInGiftSet('${esc(item.productId)}','up')" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn small secondary" onclick="movePerfumeInGiftSet('${esc(item.productId)}','down')" ${idx === giftSetItems.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn small secondary" style="border-color:var(--danger);color:var(--danger)" onclick="removePerfumeFromGiftSet('${esc(item.productId)}')">Remove</button>
        </div>
      </div>
      <div class="bsi-body">
        <div class="bsi-field">
          <label>Quantity</label>
          <input type="number" min="1" max="10" value="${item.qty}" onchange="updateGiftSetItem('${esc(item.productId)}','qty',this.value)">
        </div>
        <div class="bsi-field">
          <label>Individual price (DH) - independent of original</label>
          <input type="number" step="0.01" min="0" value="${item.price}" onchange="updateGiftSetItem('${esc(item.productId)}','price',this.value)">
        </div>
      </div>
    </div>`;
  }).join('');
}

function updateBundleSummary() {
  const stockInput = document.getElementById('pfStock');
  const hint = document.getElementById('pfStockHint');
  let totalIndividual = 0;
  let sets = Infinity;
  let totalQty = 0;
  for (const item of giftSetItems) {
    const p = item.product || getPerfumeById(item.productId);
    if (!p) continue;
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    const price = parseFloat(item.price);
    if (!isNaN(price)) totalIndividual += price * qty;
    totalQty += qty;
    sets = Math.min(sets, Math.floor((p.stock || 0) / qty));
  }
  if (giftSetItems.length === 0) {
    document.getElementById('bundleSummary').innerHTML = '<span class="sub">No perfumes selected yet.</span>';
    stockInput.disabled = false;
    hint.textContent = '';
    return;
  }
  document.getElementById('bundleSummary').innerHTML =
    `<div><b>${totalQty}</b> perfume item(s) across <b>${giftSetItems.length}</b> type(s) · Combined individual prices: <b>${totalIndividual.toFixed(2)} DH</b></div>
     <div style="margin-top:6px"><button type="button" class="btn secondary small" onclick="document.getElementById('pfPrice').value = ${totalIndividual.toFixed(2)}">Use combined sum as gift set selling price</button>
     <button type="button" class="btn secondary small" onclick="document.getElementById('pfCompareAt').value = ${totalIndividual.toFixed(2)}">Use as "compare-at" price</button></div>`;
  stockInput.disabled = true;
  hint.textContent = `Stock is automatic: ${isFinite(sets) ? sets : 0} complete set(s) available, based on the perfumes' own stock.`;
}

document.getElementById('bundleSearch').addEventListener('input', renderBundleSearch);
document.getElementById('bundleSearch').addEventListener('focus', renderBundleSearch);
document.getElementById('bundleSearch').addEventListener('blur', hideBundleSearch);
document.getElementById('bundleSearchResults').addEventListener('click', (e) => {
  const item = e.target.closest('.bundle-search-item');
  if (item && item.dataset.add) {
    addPerfumeToGiftSet(item.dataset.add);
  }
});

function syncCategoryUI() {
  const isGift = document.getElementById('pfCategory').value === 'Gift Sets';
  document.getElementById('bundleSection').style.display = isGift ? 'block' : 'none';
  if (isGift) {
    renderGiftSetSelected();
    updateBundleSummary();
  } else {
    document.getElementById('pfStock').disabled = false;
    document.getElementById('pfStockHint').textContent = '';
  }
}
document.getElementById('pfCategory').addEventListener('change', syncCategoryUI);

function openProductModal(id) {
  document.getElementById('productForm').reset();
  document.getElementById('pfPreview').style.display = 'none';
  document.getElementById('bundleSearch').value = '';
  document.getElementById('bundleSearchResults').style.display = 'none';
  giftSetItems = [];
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
    if (Array.isArray(p.bundle)) {
      giftSetItems = p.bundle.map(b => {
        const prod = getPerfumeById(b.productId) || {};
        const customPrice = b.price !== undefined && b.price !== null ? parseFloat(b.price) : (b.customPrice !== undefined && b.customPrice !== null ? parseFloat(b.customPrice) : (prod.price || 0));
        return {
          productId: b.productId,
          qty: Math.max(1, parseInt(b.qty, 10) || 1),
          price: isNaN(customPrice) ? (prod.price || 0) : customPrice,
          product: prod
        };
      });
    }
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
  if (category === 'Gift Sets') {
    const bundleData = giftSetItems.map(item => ({ productId: item.productId, qty: Math.max(1, parseInt(item.qty, 10) || 1), price: parseFloat(item.price) || 0 }));
    fd.append('bundle', JSON.stringify(bundleData));
  } else {
    fd.append('bundle', JSON.stringify([]));
  }
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

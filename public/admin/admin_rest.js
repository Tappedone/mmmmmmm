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
      <div><strong>${ordersCache.length}</strong> orders Â· <strong>${fresh}</strong> new</div>
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
      <td>${o.items.map(i => `${i.qty}Ã— ${esc(i.name)}${Array.isArray(i.bundle) ? `<br><span class="sub">${i.bundle.map(b => `${b.qty * i.qty}Ã— ${esc(b.name)}`).join(', ')}</span>` : ''}`).join('<br>')}</td>
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

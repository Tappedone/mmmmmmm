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

// Moroccan numbers typed locally (06â€¦) become international (212â€¦) so WhatsApp links work.
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

let giftSetItems = [];

function getPerfumeById(id) {
  return productsCache.find(x => x.id === id);
}

function findPerfumeByName(name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return productsCache.find(p => p.category !== 'Gift Sets' && p.name && p.name.trim().toLowerCase() === n) || null;
}

function addPerfumesFromNames() {
  const input = document.getElementById('bundleNameInput');
  if (!input) return;
  const text = input.value || '';
  if (!text.trim()) {
    toast('Enter perfume names separated by commas');
    return;
  }
  const parts = text.split(',');
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i];
    const name = raw.trim();
    if (!name) continue;
    if (giftSetItems.length >= 3) {
      toast('Maximum 3 perfumes allowed in a gift set');
      break;
    }
    const alreadyExists = giftSetItems.some(item => {
      if (item.custom) {
        return (item.name || '').trim().toLowerCase() === name.toLowerCase();
      }
      const p = item.product || getPerfumeById(item.productId);
      return p && p.name && p.name.trim().toLowerCase() === name.toLowerCase();
    });
    if (alreadyExists) continue;
    const match = findPerfumeByName(name);
    if (match) {
      giftSetItems.push({ productId: match.id, qty: 1, price: '', product: match });
    } else {
      const customId = 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2,5) + '_' + i;
      giftSetItems.push({ custom: true, productId: customId, name: name, qty: 1, price: '', product: { name: name } });
    }
  }
  input.value = '';
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
    if (value === '' || value === null || value === undefined) {
      item.price = '';
    } else {
      let pr = parseFloat(value);
      if (isNaN(pr) || pr < 0) pr = 0;
      item.price = pr;
    }
  } else if (field === 'name' && item.custom) {
    item.name = value;
    if (item.product) item.product.name = value;
  }
  updateBundleSummary();
}

function renderGiftSetSelected() {
  const container = document.getElementById('bundleSelected');
  if (giftSetItems.length === 0) {
    container.innerHTML = '<p class="empty" style="padding:10px 0">No perfumes selected yet. Add names above.</p>';
    return;
  }
  container.innerHTML = giftSetItems.map((item, idx) => {
    const p = item.product || getPerfumeById(item.productId) || {};
    const thumb = p.imageThumb || p.image;
    const name = item.custom ? (item.name || p.name || 'Custom') : (p.name || item.productId);
    const isCustom = item.custom;
    const priceVal = (item.price === '' || item.price === undefined || item.price === null) ? '' : item.price;
    return '<div class="bundle-selected-item">' +
      '<div class="bsi-header">' +
        '<div class="bsi-info">' +
          (thumb && !isCustom ? '<img src="' + esc(thumb) + '" alt="">' : '<div class="bsi-img-placeholder"></div>') +
          '<div>' +
            (isCustom ? '<input type="text" value="' + esc(name) + '" onchange="updateGiftSetItem(\'' + esc(item.productId) + '\',\'name\',this.value)" style="background:transparent;border:none;color:var(--cream);font-weight:600;font-size:0.95rem;width:200px">' : '<div class="bsi-name">' + esc(name) + '</div>') +
            '<div class="sub">' + (isCustom ? 'Custom perfume' : (esc(p.category || ''))) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="bsi-actions">' +
          '<button type="button" class="btn small secondary" onclick="movePerfumeInGiftSet(\'' + esc(item.productId) + '\',\'up\')" ' + (idx === 0 ? 'disabled' : '') + '>↑</button>' +
          '<button type="button" class="btn small secondary" onclick="movePerfumeInGiftSet(\'' + esc(item.productId) + '\',\'down\')" ' + (idx === giftSetItems.length - 1 ? 'disabled' : '') + '>↓</button>' +
          '<button type="button" class="btn small secondary" style="border-color:var(--danger);color:var(--danger)" onclick="removePerfumeFromGiftSet(\'' + esc(item.productId) + '\')">Remove</button>' +
        '</div>' +
      '</div>' +
      '<div class="bsi-body">' +
        '<div class="bsi-field">' +
          '<label>Quantity</label>' +
          '<input type="number" min="1" max="10" value="' + item.qty + '" onchange="updateGiftSetItem(\'' + esc(item.productId) + '\',\'qty\',this.value)">' +
        '</div>' +
        '<div class="bsi-field">' +
          '<label>Individual price (DH)</label>' +
          '<input type="number" step="0.01" min="0" value="' + esc(priceVal) + '" onchange="updateGiftSetItem(\'' + esc(item.productId) + '\',\'price\',this.value)" placeholder="No price">' +
        '</div>' +
      '</div>' +
    '</div>';
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
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    totalQty += qty;
    if (item.price !== '' && item.price !== undefined && item.price !== null) {
      const price = parseFloat(item.price);
      if (!isNaN(price)) totalIndividual += price * qty;
    }
    if (!item.custom && p && p.stock !== undefined) {
      sets = Math.min(sets, Math.floor((p.stock || 0) / qty));
    }
  }
  if (giftSetItems.length === 0) {
    document.getElementById('bundleSummary').innerHTML = '<span class="sub">No perfumes selected yet.</span>';
    if (stockInput) { stockInput.disabled = false; }
    if (hint) hint.textContent = '';
    return;
  }
  if (giftSetItems.length > 3) {
    document.getElementById('bundleSummary').innerHTML = '<span style="color:var(--danger)">Maximum 3 perfumes allowed.</span>';
  } else {
    if (totalIndividual > 0) {
      document.getElementById('bundleSummary').innerHTML =
        '<div><b>' + totalQty + '</b> perfume item(s) across <b>' + giftSetItems.length + '</b> type(s) · Combined individual prices: <b>' + totalIndividual.toFixed(2) + ' DH</b></div>' +
        '<div style="margin-top:6px"><button type="button" class="btn secondary small" onclick="document.getElementById(\'pfPrice\').value = ' + totalIndividual.toFixed(2) + '">Use combined sum as gift set selling price</button> ' +
        '<button type="button" class="btn secondary small" onclick="document.getElementById(\'pfCompareAt\').value = ' + totalIndividual.toFixed(2) + '">Use as "compare-at" price</button></div>';
    } else {
      document.getElementById('bundleSummary').innerHTML =
        '<div><b>' + totalQty + '</b> perfume item(s) across <b>' + giftSetItems.length + '</b> type(s) · No individual prices set yet.</div>';
    }
  }
  if (stockInput) stockInput.disabled = true;
  if (hint) {
    hint.textContent = giftSetItems.some(i => i.custom) ? 'Stock is automatic for existing perfumes only. Custom perfumes don\'t affect inventory.' : 'Stock is automatic: ' + (isFinite(sets) ? sets : 0) + ' complete set(s) available, based on the perfumes\' own stock.';
  }
}

function syncCategoryUI() {
  const isGift = document.getElementById('pfCategory').value === 'Gift Sets';
  document.getElementById('bundleSection').style.display = isGift ? 'block' : 'none';
  const nameInput = document.getElementById('pfName');
  const nameSelect = document.getElementById('pfNameSelect');
  if (isGift) {
    if (nameInput) nameInput.style.display = 'none';
    if (nameSelect) {
      nameSelect.style.display = 'block';
      const own = document.getElementById('pfId').value;
      const options = productsCache
        .filter(p => p.id !== own)
        .sort((a,b) => a.name.localeCompare(b.name));
      nameSelect.innerHTML = '<option value="">Select a product...</option>' + options.map(p => '<option value="' + esc(p.name) + '">' + esc(p.name) + ' (' + esc(p.category) + ')</option>').join('');
      // if current nameInput has value and matches, try to set select
      if (nameInput && nameInput.value) {
        for (let i = 0; i < nameSelect.options.length; i++) {
          if (nameSelect.options[i].value === nameInput.value) {
            nameSelect.value = nameInput.value;
            break;
          }
        }
      }
    }
    renderGiftSetSelected();
    updateBundleSummary();
  } else {
    if (nameInput) nameInput.style.display = 'block';
    if (nameSelect) nameSelect.style.display = 'none';
    const stockInput = document.getElementById('pfStock');
    const hint = document.getElementById('pfStockHint');
    if (stockInput) { stockInput.disabled = false; }
    if (hint) hint.textContent = '';
  }
}
document.getElementById('pfCategory').addEventListener('change', syncCategoryUI);

function openProductModal(id) {
  document.getElementById('productForm').reset();
  document.getElementById('pfPreview').style.display = 'none';
  const dropdown = document.getElementById('bundleDropdown');
  if (dropdown) dropdown.value = '';
  const cname = document.getElementById('bundleCustomName');
  const cprice = document.getElementById('bundleCustomPrice');
  if (cname) cname.value = '';
  if (cprice) cprice.value = '';
  giftSetItems = [];
  if (id) {
    const p = productsCache.find(x => x.id === id);
    document.getElementById('productModalTitle').textContent = 'Edit Product';
    document.getElementById('pfId').value = p.id;
    document.getElementById('pfName').value = p.name || '';
    document.getElementById('pfCategory').value = p.category;
    document.getElementById('pfPrice').value = p.price;
    document.getElementById('pfCompareAt').value = p.compareAtPrice || '';
    document.getElementById('pfStock').value = p.stock;
    document.getElementById('pfDescription').value = p.description || '';
    document.getElementById('pfActive').checked = p.active;
    if (Array.isArray(p.bundle)) {
      giftSetItems = p.bundle.map(b => {
        if (b.custom || b.customName || (!b.productId && b.name) || (typeof b.productId === 'string' && b.productId.indexOf('custom_') === 0)) {
          return {
            custom: true,
            name: b.name || b.customName || 'Custom',
            productId: b.productId || ('custom_' + Math.random().toString(36).substr(2,9)),
            qty: Math.max(1, parseInt(b.qty, 10) || 1),
            price: parseFloat(b.price) || 0,
            product: { name: b.name || b.customName || 'Custom' }
          };
        }
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
  if (category === 'Gift Sets' && giftSetItems.length > 3) {
    toast('Maximum 3 perfumes allowed in a gift set');
    return;
  }
  const fd = new FormData();
  let nameValue = document.getElementById('pfName').value;
  if (category === 'Gift Sets') {
    const nameSelect = document.getElementById('pfNameSelect');
    if (nameSelect && nameSelect.style.display !== 'none') {
      nameValue = nameSelect.value;
    }
  }
  fd.append('name', nameValue);
  fd.append('category', category);
  fd.append('price', document.getElementById('pfPrice').value);
  fd.append('compareAtPrice', document.getElementById('pfCompareAt').value);
  const stockInput = document.getElementById('pfStock');
  if (stockInput && !stockInput.disabled) fd.append('stock', stockInput.value);
  fd.append('description', document.getElementById('pfDescription').value);
  fd.append('active', document.getElementById('pfActive').checked);
  if (category === 'Gift Sets') {
    const bundleData = giftSetItems.map(item => {
      if (item.custom) {
        return { custom: true, name: item.name || (item.product && item.product.name) || 'Custom', productId: item.productId, qty: Math.max(1, parseInt(item.qty, 10) || 1), price: (item.price === '' || item.price === undefined || item.price === null) ? '' : parseFloat(item.price) };
      }
      return { productId: item.productId, qty: Math.max(1, parseInt(item.qty, 10) || 1), price: (item.price === '' || item.price === undefined || item.price === null) ? '' : parseFloat(item.price) };
    });
    fd.append('bundle', JSON.stringify(bundleData));
  } else {
    fd.append('bundle', JSON.stringify([]));
  }

checkAuth();

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
  if (category === 'Gift Sets') {
    const bundleData = giftSetItems.map(item => {
      if (item.custom) {
        return { custom: true, name: item.name || (item.product && item.product.name) || 'Custom', productId: item.productId, qty: Math.max(1, parseInt(item.qty, 10) || 1), price: parseFloat(item.price) || 0 };
      }
      return { productId: item.productId, qty: Math.max(1, parseInt(item.qty, 10) || 1), price: parseFloat(item.price) || 0 };
    });
    fd.append('bundle', JSON.stringify(bundleData));
  } else {
    fd.append('bundle', JSON.stringify([]));
  }

checkAuth();


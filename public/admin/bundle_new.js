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

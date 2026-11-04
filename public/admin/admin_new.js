// ----- Gift set builder -----
let giftSetItems = [];

function getPerfumeById(id) {
  return productsCache.find(x => x.id === id);
}

function populateBundleDropdown() {
  const dropdown = document.getElementById('bundleDropdown');
  if (!dropdown) return;
  const own = document.getElementById('pfId').value;
  const already = new Set(giftSetItems.map(i => i.productId));
  const options = productsCache
    .filter(p => p.category !== 'Gift Sets' && p.id !== own && !already.has(p.id))
    .sort((a,b) => a.name.localeCompare(b.name));
  dropdown.innerHTML = '<option value="">Select a perfume from existing categories...</option>' +
    options.map(p => '<option value=\"' + esc(p.id) + '\">' + esc(p.name) + ' (' + esc(p.category) + ') - ' + p.price + ' DH</option>').join('');
}

function addFromDropdown() {
  const dropdown = document.getElementById('bundleDropdown');
  const productId = dropdown.value;
  if (!productId) return;
  if (giftSetItems.length >= 3) {
    toast('Maximum 3 perfumes allowed in a gift set');
    return;
  }
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
  dropdown.value = '';
  populateBundleDropdown();
  renderGiftSetSelected();
  updateBundleSummary();
}

function addCustomPerfume() {
  const nameInput = document.getElementById('bundleCustomName');
  const priceInput = document.getElementById('bundleCustomPrice');
  const name = (nameInput.value || '').trim();
  if (!name) {
    toast('Enter a perfume name');
    return;
  }
  if (giftSetItems.length >= 3) {
    toast('Maximum 3 perfumes allowed in a gift set');
    return;
  }
  let price = 0;
  if (priceInput) {
    price = parseFloat(priceInput.value);
    if (isNaN(price) || price < 0) price = 0;
  }
  const customId = 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2,5);
  giftSetItems.push({
    custom: true,
    productId: customId,
    name: name,
    qty: 1,
    price: price,
    product: { name: name }
  });
  nameInput.value = '';
  if (priceInput) priceInput.value = '';
  populateBundleDropdown();
  renderGiftSetSelected();
  updateBundleSummary();
}

function removePerfumeFromGiftSet(productId) {
  giftSetItems = giftSetItems.filter(i => i.productId !== productId);
  populateBundleDropdown();
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
  } else if (field === 'name' && item.custom) {
    item.name = value;
    if (item.product) item.product.name = value;
  }
  updateBundleSummary();
}

function renderGiftSetSelected() {
  const container = document.getElementById('bundleSelected');
  if (giftSetItems.length === 0) {
    container.innerHTML = '<p class="empty" style="padding:10px 0">No perfumes selected yet. Add from dropdown or add a custom perfume.</p>';
    return;
  }
  container.innerHTML = giftSetItems.map((item, idx) => {
    const p = item.product || getPerfumeById(item.productId) || {};
    const thumb = p.imageThumb || p.image;
    const name = item.custom ? (item.name || p.name || 'Custom') : (p.name || item.productId);
    const isCustom = item.custom;
    return '<div class=\"bundle-selected-item\">' +
      '<div class=\"bsi-header\">' +
        '<div class=\"bsi-info\">' +
          (thumb && !isCustom ? '<img src=\"' + esc(thumb) + '\" alt=\"\">' : '<div class=\"bsi-img-placeholder\"></div>') +
          '<div>' +
            (isCustom ? '<input type=\"text\" value=\"' + esc(name) + '\" onchange=\"updateGiftSetItem(\'' + esc(item.productId) + '\',\'name\',this.value)\" style=\"background:transparent;border:none;color:var(--cream);font-weight:600;font-size:0.95rem;width:200px\">' : '<div class=\"bsi-name\">' + esc(name) + '</div>') +
            '<div class=\"sub\">' + (isCustom ? 'Custom perfume' : (esc(p.category || '') + (p.price !== undefined ? ' · Original: ' + p.price + ' DH' : ''))) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class=\"bsi-actions\">' +
          '<button type=\"button\" class=\"btn small secondary\" onclick=\"movePerfumeInGiftSet(\'' + esc(item.productId) + '\',\'up\')\" ' + (idx === 0 ? 'disabled' : '') + '>?</button>' +
          '<button type=\"button\" class=\"btn small secondary\" onclick=\"movePerfumeInGiftSet(\'' + esc(item.productId) + '\',\'down\')\" ' + (idx === giftSetItems.length - 1 ? 'disabled' : '') + '>?</button>' +
          '<button type=\"button\" class=\"btn small secondary\" style=\"border-color:var(--danger);color:var(--danger)\" onclick=\"removePerfumeFromGiftSet(\'' + esc(item.productId) + '\')\">Remove</button>' +
        '</div>' +
      '</div>' +
      '<div class=\"bsi-body\">' +
        '<div class=\"bsi-field\">' +
          '<label>Quantity</label>' +
          '<input type=\"number\" min=\"1\" max=\"10\" value=\"' + item.qty + '\" onchange=\"updateGiftSetItem(\'' + esc(item.productId) + '\',\'qty\',this.value)\">' +
        '</div>' +
        '<div class=\"bsi-field\">' +
          '<label>Individual price (DH)</label>' +
          '<input type=\"number\" step=\"0.01\" min=\"0\" value=\"' + item.price + '\" onchange=\"updateGiftSetItem(\'' + esc(item.productId) + '\',\'price\',this.value)\">' +
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
    const price = parseFloat(item.price);
    if (!isNaN(price)) totalIndividual += price * qty;
    totalQty += qty;
    if (!item.custom && p && p.stock !== undefined) {
      sets = Math.min(sets, Math.floor((p.stock || 0) / qty));
    }
  }
  if (giftSetItems.length === 0) {
    document.getElementById('bundleSummary').innerHTML = '<span class=\"sub\">No perfumes selected yet.</span>';
    if (stockInput) { stockInput.disabled = false; }
    if (hint) hint.textContent = '';
    return;
  }
  if (giftSetItems.length > 3) {
    document.getElementById('bundleSummary').innerHTML = '<span style=\"color:var(--danger)\">Maximum 3 perfumes allowed.</span>';
  } else {
    document.getElementById('bundleSummary').innerHTML =
      '<div><b>' + totalQty + '</b> perfume item(s) across <b>' + giftSetItems.length + '</b> type(s) · Combined individual prices: <b>' + totalIndividual.toFixed(2) + ' DH</b></div>' +
      '<div style=\"margin-top:6px\"><button type=\"button\" class=\"btn secondary small\" onclick=\"document.getElementById(\'pfPrice\').value = ' + totalIndividual.toFixed(2) + '\">Use combined sum as gift set selling price</button> ' +
      '<button type=\"button\" class=\"btn secondary small\" onclick=\"document.getElementById(\'pfCompareAt\').value = ' + totalIndividual.toFixed(2) + '\">Use as \"compare-at\" price</button></div>';
  }
  if (stockInput) stockInput.disabled = true;
  if (hint) {
    hint.textContent = giftSetItems.some(i => i.custom) ? 'Stock is automatic for existing perfumes only. Custom perfumes don\'t affect inventory.' : 'Stock is automatic: ' + (isFinite(sets) ? sets : 0) + ' complete set(s) available, based on the perfumes\' own stock.';
  }
}

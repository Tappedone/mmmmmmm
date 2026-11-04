function syncCategoryUI() {
  const isGift = document.getElementById('pfCategory').value === 'Gift Sets';
  document.getElementById('bundleSection').style.display = isGift ? 'block' : 'none';
  if (isGift) {
    renderGiftSetSelected();
    updateBundleSummary();
    if (typeof populateBundleDropdown === 'function') populateBundleDropdown();
  } else {
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
    document.getElementById('pfName').value = p.name;
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
  fd.append('name', document.getElementById('pfName').value);
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

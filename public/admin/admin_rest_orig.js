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


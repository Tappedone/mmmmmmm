// Runs before the page paints: if this visitor already answered "Men / Women / Gift Sets"
// during this visit, hide the question straight away (no flash).
try {
  const params = new URLSearchParams(location.search);
  if (params.get('preset') === 'fr' || params.get('lang') === 'fr') {
    try { localStorage.setItem('mb_lang', 'fr'); localStorage.setItem('mb_fr_preset', '1'); } catch(e){}
  }
  if (localStorage.getItem('mb_fr_preset') === '1') {
    try { localStorage.setItem('mb_lang', 'fr'); } catch(e){}
  }
  if (sessionStorage.getItem('mb_landing_seen')) document.documentElement.classList.add('seen');
} catch (e) { /* storage blocked — they'll just see the question once more */ }

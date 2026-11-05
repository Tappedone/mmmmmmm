// Runs before the page paints: if this visitor already answered "Men / Women / Gift Sets"
// during this visit, hide the question straight away (no flash).
try {
  if (sessionStorage.getItem('mb_landing_seen')) document.documentElement.classList.add('seen');
} catch (e) { /* storage blocked — they'll just see the question once more */ }

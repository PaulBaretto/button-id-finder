// Runs before the popup paints so it opens in the right theme (no flash).
(() => {
  const sys = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = localStorage.getItem('ts_theme_cache') || sys();
  chrome.storage.local.get({ ts_theme: '' }, (r) => {
    const t = r.ts_theme || sys();
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('ts_theme_cache', t); } catch (e) { /* ignore */ }
  });
})();

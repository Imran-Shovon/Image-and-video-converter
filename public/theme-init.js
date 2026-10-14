// Applies the saved theme before first paint (external file so the CSP can forbid inline scripts).
(function () {
  var pref = 'light';
  try {
    pref = localStorage.getItem('mt-theme') || 'light';
  } catch (e) {}
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();

// JOURNAL-CSP-01 Phase 3 step 2: theme before first paint (was inline base.1 in
// themes/ergo/templates/base.html). Loaded as a blocking <script src> right after the
// #themeCSS link, so dark readers switch that same element before the first paint.
(function () {
  var storedTheme = localStorage.getItem('ergo-theme');
  var t = storedTheme === 'dark' ? 'dark' : 'default';
  if (storedTheme !== t) localStorage.setItem('ergo-theme', t);
  document.documentElement.dataset.theme = t;
  document.documentElement.classList.toggle('theme-dark', t === 'dark');
  document.documentElement.classList.toggle('theme-default', t !== 'dark');
  if (t === 'dark') document.getElementById('themeCSS').href = '/dark.css';
})();

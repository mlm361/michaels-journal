// The generated shell shares the normal theme scripts. Event listeners replace
// inline handlers so the dynamic reply page can keep a nonce-based CSP.
document.addEventListener('DOMContentLoaded', function () {
  if (typeof main === 'function') main();
  var menu = document.getElementById('nav-hamburger');
  var theme = document.getElementById('theme-toggle');
  if (menu) menu.addEventListener('click', function () { toggleNav(); });
  if (theme) theme.addEventListener('click', function () { toggleTheme(); });
});

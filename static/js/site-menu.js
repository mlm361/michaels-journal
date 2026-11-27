// JOURNAL-CSP-01 Phase 3 step 2: top menu wiring (was inline menu.1 plus the
// onclick="toggleNav()", onclick="toggleTheme()" and <body onload="main();"> handlers).
// Loaded right after the menu markup, so both buttons already exist. main() and
// toggleTheme() come from /theme_selector.js in <head>. This is the only place the
// buttons are bound, reply pages included.
(function () {
  var links = document.getElementById('nav-links');
  var hamburger = document.getElementById('nav-hamburger');
  if (hamburger && links) {
    hamburger.addEventListener('click', function () {
      links.classList.toggle('open');
      hamburger.classList.toggle('open');
    });
  }
  var theme = document.getElementById('theme-toggle');
  if (theme) {
    theme.addEventListener('click', function () {
      if (typeof toggleTheme === 'function') toggleTheme();
    });
  }
  window.addEventListener('load', function () {
    if (typeof main === 'function') main();
  });
})();

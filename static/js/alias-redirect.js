// JOURNAL-CSP-01 Phase 3 step 1: redirect helper for Zola's alias pages (templates/internal/alias.html).
// Replaces Zola's built-in inline redirect script. Keeps the visitor's #fragment, and only follows a
// same-origin target written by the build. Without JavaScript the page's meta refresh still redirects.
(function () {
  var script = document.currentScript;
  var raw = script && script.getAttribute('data-target');
  if (!raw) return;
  var target;
  try {
    target = new URL(raw, window.location.href);
  } catch (e) {
    return;
  }
  if (target.origin !== window.location.origin) return;
  target.hash = window.location.hash;
  window.location.replace(target.href);
})();

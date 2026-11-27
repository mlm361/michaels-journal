// JOURNAL-CSP-01 Phase 3 step 2: TownSquare offline fallback (was inline base.4).
// If the self-hosted TownSquare can't be reached, the widget never mounts. After a
// grace period, collapse the empty box and reveal any offline note. Applies to the
// footer widget and to the /townsquare/ page.
(function () {
  var root = document.getElementById('townsquare-root');
  if (!root) return;
  window.setTimeout(function () {
    if (root.childElementCount === 0) {
      root.style.display = 'none';
      var msg = document.querySelector('.townsquare-offline');
      if (msg) msg.hidden = false;
    }
  }, 8000);
})();

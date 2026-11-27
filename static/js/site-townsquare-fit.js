// JOURNAL-CSP-01 Phase 3 step 2: fit the footer TownSquare on phones (was inline base.3).
// Lay it out at a fixed desktop-like width (so scene props don't collide) and scale
// the whole widget down to the available width. Only kicks in <=640px.
(function () {
  var LOGICAL_WIDTH = 640;
  var wrap = document.querySelector('.ts-scale');
  var root = wrap && wrap.querySelector('#townsquare-root');
  if (!wrap || !root) return;
  function fit() {
    if (window.innerWidth > 640) {
      root.style.transform = '';
      wrap.style.height = '';
      return;
    }
    var avail = wrap.clientWidth || window.innerWidth;
    var scale = avail / LOGICAL_WIDTH;
    root.style.transform = 'scale(' + scale + ')';
    // offsetHeight is the unscaled layout height; reserve the
    // scaled height so there is no empty gap below the widget.
    wrap.style.height = (root.offsetHeight * scale) + 'px';
  }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
  // The widget mounts asynchronously and changes height as it
  // renders, so refit on resize + whenever its size changes.
  if (window.ResizeObserver) { new ResizeObserver(fit).observe(root); }
  fit();
  [200, 600, 1500, 3000].forEach(function (t) { window.setTimeout(fit, t); });
})();

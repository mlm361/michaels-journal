// JOURNAL-CSP-01 Phase 3 step 5a: the Photo Grid lightbox without inline code.
//
// Blog Poster's Photo Grid (step 5b) writes this markup, with no <script> and no on* handlers:
//   tile:     <a href="FULL-IMAGE-URL" data-pg-open data-alt="..." data-caption="..."><img ...></a>
//   lightbox: <div id="pgLb" data-pg-lightbox style="display:none;...">
//               <img id="pgLbImg" data-pg-stop ...> <p id="pgLbCap"></p>
//               <button type="button" data-pg-close aria-label="Close">...</button>
//             </div>
// base.html loads this file only on pages whose content contains data-pg-open.
//
// Posts published before step 6 still carry the old markup: onclick="pgLbOpen(this);return false;"
// on each tile, onclick handlers on the lightbox, and their own inline script. Any element that
// still has an onclick attribute keeps it and is skipped here, so every tile and control is bound
// exactly once, even on a page that mixes both kinds.
(function () {
  'use strict';

  function lightbox() {
    return document.getElementById('pgLb');
  }

  function open(a) {
    var box = lightbox();
    var img = document.getElementById('pgLbImg');
    var cap = document.getElementById('pgLbCap');
    if (!box || !img) return false;
    // Only show http(s) images; anything else falls back to the link's normal behaviour.
    var url;
    try {
      url = new URL(a.getAttribute('href'), document.baseURI);
    } catch (e) {
      return false;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    img.src = url.href;
    img.alt = a.getAttribute('data-alt') || '';
    if (cap) cap.textContent = a.getAttribute('data-caption') || '';
    box.style.display = 'flex';
    return true;
  }

  function close() {
    var box = lightbox();
    if (box) box.style.display = 'none';
  }

  function bindOnce(el, type, fn) {
    if (!el || el.hasAttribute('onclick') || el.getAttribute('data-pg-bound') === '1') return false;
    el.setAttribute('data-pg-bound', '1');
    el.addEventListener(type, fn);
    return true;
  }

  function init() {
    var tiles = document.querySelectorAll('a[data-pg-open]');
    for (var i = 0; i < tiles.length; i++) {
      (function (a) {
        bindOnce(a, 'click', function (e) {
          if (open(a)) e.preventDefault();
        });
      })(tiles[i]);
    }

    var box = lightbox();
    if (!box || !box.hasAttribute('data-pg-lightbox')) return;
    bindOnce(box, 'click', close);
    var stops = box.querySelectorAll('[data-pg-stop]');
    for (var j = 0; j < stops.length; j++) {
      bindOnce(stops[j], 'click', function (e) {
        e.stopPropagation();
      });
    }
    var closers = box.querySelectorAll('[data-pg-close]');
    for (var k = 0; k < closers.length; k++) {
      bindOnce(closers[k], 'click', function (e) {
        e.stopPropagation();
        close();
      });
    }
    // The old inline script already closes #pgLb on Escape; add the key only when it is absent.
    if (typeof window.pgLbClose !== 'function' && document.documentElement.getAttribute('data-pg-keys') !== '1') {
      document.documentElement.setAttribute('data-pg-keys', '1');
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') close();
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

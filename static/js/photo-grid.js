// JOURNAL-CSP-01 Phase 3 step 5a: the Photo Grid lightbox without inline code.
//
// Blog Poster's Photo Grid (step 5b) writes this markup, with no <script>, no on* handlers and
// no id attributes. Each grid carries its own lightbox:
//   <div data-pg-grid ...>
//     ... <a href="FULL-IMAGE-URL" data-pg-open data-alt="..." data-caption="..."><img ...></a> ...
//     <div data-pg-lightbox style="display:none;...">
//       <img data-pg-img src="" alt=""> <p data-pg-cap></p>
//       <button type="button" data-pg-close aria-label="Close">...</button>
//     </div>
//   </div>
// A tile opens the lightbox inside its own [data-pg-grid] and shows its own image and caption.
// base.html loads this file only on pages whose content contains data-pg-open.
//
// Posts published before step 6 still carry the old markup (ids pgLb/pgLbImg/pgLbCap, onclick
// handlers and their own inline script). The old markup is never inside [data-pg-grid], uses no
// data-pg-* hooks, and keeps its ids, handlers and Escape listener to itself; nothing here looks
// up those ids. Any element that still has an onclick attribute is never bound here.
(function () {
  'use strict';

  var GRID = '[data-pg-grid]';
  var BOX = '[data-pg-lightbox]';

  function boxFor(tile) {
    var grid = tile.closest(GRID);
    return grid ? grid.querySelector(BOX) : null;
  }

  function open(tile) {
    var box = boxFor(tile);
    var img = box && box.querySelector('[data-pg-img]');
    if (!img) return false;
    // Only show http(s) images; anything else falls back to the link's normal behaviour.
    var url;
    try {
      url = new URL(tile.getAttribute('href'), document.baseURI);
    } catch (e) {
      return false;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    var cap = box.querySelector('[data-pg-cap]');
    img.src = url.href;
    img.alt = tile.getAttribute('data-alt') || '';
    if (cap) cap.textContent = tile.getAttribute('data-caption') || '';
    box.style.display = 'flex';
    return true;
  }

  function close(box) {
    box.style.display = 'none';
  }

  function bindOnce(el, type, fn) {
    if (!el || el.hasAttribute('onclick') || el.getAttribute('data-pg-bound') === '1') return false;
    el.setAttribute('data-pg-bound', '1');
    el.addEventListener(type, fn);
    return true;
  }

  function init() {
    var tiles = document.querySelectorAll(GRID + ' a[data-pg-open]');
    for (var i = 0; i < tiles.length; i++) {
      (function (tile) {
        bindOnce(tile, 'click', function (e) {
          if (open(tile)) e.preventDefault();
        });
      })(tiles[i]);
    }

    var boxes = document.querySelectorAll(GRID + ' ' + BOX);
    for (var j = 0; j < boxes.length; j++) {
      (function (box) {
        bindOnce(box, 'click', function () {
          close(box);
        });
        var img = box.querySelector('[data-pg-img]');
        bindOnce(img, 'click', function (e) {
          e.stopPropagation();
        });
        var closers = box.querySelectorAll('[data-pg-close]');
        for (var k = 0; k < closers.length; k++) {
          bindOnce(closers[k], 'click', function (e) {
            e.stopPropagation();
            close(box);
          });
        }
      })(boxes[j]);
    }

    // Escape closes any open new lightbox; the old inline script handles its own box.
    if (boxes.length && document.documentElement.getAttribute('data-pg-keys') !== '1') {
      document.documentElement.setAttribute('data-pg-keys', '1');
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var open = document.querySelectorAll(GRID + ' ' + BOX);
        for (var n = 0; n < open.length; n++) {
          if (open[n].style.display !== 'none') close(open[n]);
        }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

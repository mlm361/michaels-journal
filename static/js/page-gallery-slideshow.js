// JOURNAL-CSP-01 Phase 3 step 3: Gallery slideshow (carousel) controls, keys, swipe and timer (was inline gallery-slideshow.1). Loads right after the #carousel markup.
(function () {
  var root = document.getElementById('carousel');
  if (!root) return;

  var items = Array.from(document.querySelectorAll('#carousel-photos li'));
  if (items.length === 0) return;
  var data = items.map(function (li) {
    return {
      src: li.dataset.src,
      alt: li.dataset.alt || '',
      caption: li.dataset.caption || ''
    };
  });

  var img      = document.getElementById('carousel-img');
  var caption  = document.getElementById('carousel-caption');
  var counter  = document.getElementById('carousel-counter');
  var btnPrev  = document.getElementById('carousel-prev');
  var btnNext  = document.getElementById('carousel-next');
  var btnPlay  = document.getElementById('carousel-playpause');

  img.addEventListener('error', function () {
    console.error('Carousel image failed to load:', img.src);
  });

  var slideMs    = parseInt(root.getAttribute('data-slide-ms'), 10) || 5000;
  var idx        = 0;
  var isPlaying  = true;
  var slideTimer = null;

  function show(n) {
    idx = (n + data.length) % data.length;
    var item = data[idx];
    img.src = item.src;
    img.alt = item.alt || '';
    caption.textContent = item.caption || '';
    counter.textContent = (idx + 1) + ' / ' + data.length;
    restartTimer();
  }

  function next() { show(idx + 1); }
  function prev() { show(idx - 1); }

  function restartTimer() {
    if (slideTimer) { clearTimeout(slideTimer); slideTimer = null; }
    if (isPlaying) slideTimer = setTimeout(next, slideMs);
  }

  function play() {
    isPlaying = true;
    btnPlay.textContent = 'Pause Slideshow';
    btnPlay.setAttribute('aria-pressed', 'true');
    restartTimer();
  }
  function pause() {
    isPlaying = false;
    btnPlay.textContent = 'Play Slideshow';
    btnPlay.setAttribute('aria-pressed', 'false');
    if (slideTimer) { clearTimeout(slideTimer); slideTimer = null; }
  }

  btnPlay.addEventListener('click', function () { isPlaying ? pause() : play(); });
  btnPrev.addEventListener('click', prev);
  btnNext.addEventListener('click', next);

  document.addEventListener('keydown', function (e) {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    else if (e.key === ' ') { e.preventDefault(); isPlaying ? pause() : play(); }
  });

  // Touch swipe on the image area
  var sx = null, sy = null;
  var viewer = root.querySelector('.carousel__viewer');
  viewer.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  viewer.addEventListener('touchend', function (e) {
    if (sx === null) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      dx < 0 ? next() : prev();
    }
    sx = sy = null;
  }, { passive: true });

  // Pause when the tab is hidden so we don't pile up timers
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (slideTimer) { clearTimeout(slideTimer); slideTimer = null; }
    } else if (isPlaying) {
      restartTimer();
    }
  });

  show(0);
})();

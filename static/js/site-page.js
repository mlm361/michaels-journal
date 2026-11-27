// JOURNAL-CSP-01 Phase 3 step 2: end-of-page enhancements, moved unchanged from the inline
// scripts at the bottom of themes/ergo/templates/base.html: footer year, uptime and the
// scroll-to-top button (base.5), the daily avatar (base.6) and the .e-content image
// lightbox (base.7). Loaded at the end of <body>, so the footer and content exist.
(function () {
  // base.5: footer year, blog uptime, scroll-to-top.
  document.addEventListener('DOMContentLoaded', function () {
    var yearEl = document.getElementById('currentYear');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  });

  var uptimeStart = new Date('2025-07-05T00:00:00Z');
  function updateUptime() {
    var diff    = new Date() - uptimeStart;
    var secs    = Math.floor(diff / 1000);
    var mins    = Math.floor(secs / 60);
    var hours   = Math.floor(mins / 60);
    var days    = Math.floor(hours / 24);
    var years   = Math.floor(days / 365);
    var months  = Math.floor((days % 365) / 30);
    var remDays = days % 365 % 30;
    var remHrs  = hours % 24;
    var remMins = mins % 60;
    var remSecs = secs % 60;
    var parts   = [];
    if (years)             parts.push(years   + (years   === 1 ? ' year'   : ' years'));
    if (months)            parts.push(months  + (months  === 1 ? ' month'  : ' months'));
    if (remDays || parts.length) parts.push(remDays + (remDays === 1 ? ' day'    : ' days'));
    parts.push(remHrs  + (remHrs  === 1 ? ' hour'   : ' hours'));
    parts.push(remMins + (remMins === 1 ? ' minute' : ' minutes'));
    parts.push(remSecs + (remSecs === 1 ? ' second' : ' seconds'));
    var el = document.getElementById('blog-uptime');
    if (el) el.textContent = 'This blog has been running for: ' + parts.join(', ') + '.';
  }
  updateUptime();
  setInterval(updateUptime, 1000);

  (function () {
    var button = document.getElementById('scrollToTop');
    if (!button) return;

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function syncButtonVisibility() {
      var visible = window.scrollY > 420;
      button.classList.toggle('is-visible', visible);
      button.setAttribute('aria-hidden', visible ? 'false' : 'true');
      button.tabIndex = visible ? 0 : -1;
    }

    button.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    window.addEventListener('scroll', syncButtonVisibility, { passive: true });
    syncButtonVisibility();
  })();

  // base.6: one avatar per UTC day, the same on every page.
  (function () {
    var avatars = [
      'https://media.mitchelltribe.xyz/site/img/avatar.avif',
      'https://media.mitchelltribe.xyz/site/img/avatar-1.avif', 'https://media.mitchelltribe.xyz/site/img/avatar-2.avif', 'https://media.mitchelltribe.xyz/site/img/avatar-3.avif', 'https://media.mitchelltribe.xyz/site/img/avatar-4.avif',
      'https://media.mitchelltribe.xyz/site/img/avatar-5.avif', 'https://media.mitchelltribe.xyz/site/img/avatar-6.avif', 'https://media.mitchelltribe.xyz/site/img/avatar-7.avif', 'https://media.mitchelltribe.xyz/site/img/avatar-8.avif',
      'https://media.mitchelltribe.xyz/site/img/avatar-9.avif', 'https://media.mitchelltribe.xyz/site/img/avatar-10.avif', 'https://media.mitchelltribe.xyz/site/img/avatar-11.avif'
    ];
    var now = new Date();
    var startOfYear = Date.UTC(now.getUTCFullYear(), 0, 0);
    var dayOfYear = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - startOfYear) / 86400000);
    var key = now.getUTCFullYear() * 1000 + dayOfYear;
    var pick = avatars[key % avatars.length];
    document.querySelectorAll('.user_logo a, .mini_logo a').forEach(function (a) {
      a.style.backgroundImage = 'url(' + pick + ')';
    });
    var aboutImg = document.querySelector('.about-avatar img');
    if (aboutImg) aboutImg.src = pick;
  })();

  // base.7: open linked or inline post images in a lightbox.
  (function () {
    var content = document.querySelector('.e-content');
    if (!content) return;
    var IMG_RE = /\.(jpe?g|png|gif|avif|webp)(\?|$)/i;
    var ov = document.createElement('div');
    ov.className = 'mr-lightbox';
    ov.setAttribute('aria-hidden', 'true');
    ov.innerHTML = '<button class="mr-lightbox-close" aria-label="Close">&times;</button><img alt="">';
    document.body.appendChild(ov);
    var ovImg = ov.querySelector('img');
    function open(src) { ovImg.src = src; ov.classList.add('is-open'); ov.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; }
    function close() { ov.classList.remove('is-open'); ov.setAttribute('aria-hidden', 'true'); ovImg.src = ''; document.body.style.overflow = ''; }
    content.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a') : null;
      var img = e.target.closest ? e.target.closest('img') : null;
      var src = null;
      if (a && IMG_RE.test(a.getAttribute('href') || '')) { src = a.href; }
      else if (img) { var pa = img.closest('a'); src = (pa && IMG_RE.test(pa.getAttribute('href') || '')) ? pa.href : (img.currentSrc || img.src); }
      if (src) { e.preventDefault(); open(src); }
    });
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.classList.contains('mr-lightbox-close')) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ov.classList.contains('is-open')) close(); });
  })();
})();

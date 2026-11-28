// Footer Nostr ostrich (JOURNAL-FOOTER-NOSTR-01). The markup shows the still icon. When the
// icon first scrolls into view, this swaps in the animated AVIF (which plays 4 times, about
// 3.5 s) and puts the still icon back 4 s after the animation has loaded, so the movement
// always stops within 5 s (WCAG 2.2.2) even where a browser ignores the file's play count.
// Reduced motion, no IntersectionObserver or no JavaScript: the still icon only.
(function () {
  var img = document.querySelector('img[data-anim-src]');
  if (!img || !('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var still = img.getAttribute('src');
  var io = new IntersectionObserver(function (entries) {
    if (!entries.some(function (e) { return e.isIntersecting; })) return;
    io.disconnect();
    img.addEventListener('load', function () {
      setTimeout(function () { img.src = still; }, 4000);
    }, { once: true });
    img.src = img.getAttribute('data-anim-src');
  });
  io.observe(img);
})();

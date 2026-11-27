// JOURNAL-CSP-01 Phase 3 step 3: Gallery page: start GLightbox and set video volume (was inline gallery-single.1). Loads after the vendored glightbox.min.js.
document.addEventListener("DOMContentLoaded", function () {
  GLightbox({ selector: ".glightbox", touchNavigation: true, loop: true });
  document.querySelectorAll(".gallery-video").forEach(v => v.volume = 0.5);
});

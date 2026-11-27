// JOURNAL-CSP-01 Phase 3 step 3: Home pagination: type a page number and press Enter (was inline pagination.1). Loads right after the .pager nav.
(function () {
  document.querySelectorAll('.pager').forEach(function (pager) {
    var input = pager.querySelector('.pager-input');
    if (!input) return;
    var current = parseInt(pager.getAttribute('data-current-page'), 10) || 1;
    var total = parseInt(pager.getAttribute('data-total-pages'), 10) || 1;

    function pageUrl(page) {
      if (page <= 1) return '/';
      return '/page/' + page + '/';
    }

    input.addEventListener('focus', function () {
      input.select();
    });

    input.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      var requested = parseInt(input.value, 10);
      if (Number.isNaN(requested)) {
        input.value = String(current);
        return;
      }
      requested = Math.max(1, Math.min(total, requested));
      if (requested === current) {
        input.value = String(current);
        input.blur();
        return;
      }
      window.location.href = pageUrl(requested);
    });

    input.addEventListener('blur', function () {
      input.value = String(current);
    });
  });
})();

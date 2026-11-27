// JOURNAL-CSP-01 Phase 3 step 3: Archive page: per-year and per-month post counts and the jump-to-year menu (was inline archive.1).
(function() {
  function addCounts() {
    function label(n) { return ' <span class="archive-count">(' + n + ' post' + (n === 1 ? '' : 's') + ')</span>'; }
    document.querySelectorAll('.archive-year').forEach(function (yearEl) {
      var heading = yearEl.querySelector('.archive-year-heading');
      if (heading) heading.insertAdjacentHTML('beforeend', label(yearEl.querySelectorAll('.archive-entry').length));
      yearEl.querySelectorAll('.archive-month-heading').forEach(function (mh) {
        var list = mh.nextElementSibling;
        if (list && list.classList.contains('archive-month-list')) {
          mh.insertAdjacentHTML('beforeend', label(list.querySelectorAll('.archive-entry').length));
        }
      });
    });
  }
  function init() {
    addCounts();
    var sel = document.getElementById('year-select');
    if (!sel) return;
    var sections = document.querySelectorAll('.archive-year');
    if (sections.length === 0) return;
    for (var i = 0; i < sections.length; i++) {
      var y = sections[i].id.replace('year-', '');
      if (!y) continue;
      var opt = document.createElement('option');
      opt.value = y;
      var yc = sections[i].querySelectorAll('.archive-entry').length;
      opt.textContent = y + ' (' + yc + ')';
      sel.appendChild(opt);
    }
    sel.addEventListener('change', function() {
      var y = this.value;
      if (!y) return;
      var el = document.getElementById('year-' + y);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

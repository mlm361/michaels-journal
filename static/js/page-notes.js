// JOURNAL-CSP-01 Phase 3 step 3: Notes page: sticky-note Expand/Collapse buttons (was inline notes.1).
(function () {
  document.querySelectorAll('[data-sticky-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var note = btn.closest('.sticky-note');
      if (!note) return;
      var expanded = note.classList.toggle('is-expanded');
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      btn.textContent = expanded ? 'Collapse' : 'Expand';
    });
  });
})();

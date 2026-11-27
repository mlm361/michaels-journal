// JOURNAL-CSP-01 Phase 3 step 3: Search page: load the elasticlunr index and render results (was inline search.1). Loads after /elasticlunr.min.js; uses window.MichaelUrlSafety from url-safety.js.
(function() {
  var idx, store;

  function safeSearchHref(value) {
    var href = window.MichaelUrlSafety
      ? window.MichaelUrlSafety.publicHttpUrl(value)
      : '';
    if (!href) return '';
    var parsed = new URL(href);
    // The production host, or the build's own host (a preview built with --base-url).
    return (parsed.hostname === 'michaelreflects.com' || parsed.hostname === 'www.michaelreflects.com'
            || parsed.hostname === window.location.hostname)
      ? href
      : '';
  }

  fetch('/search_index.en.json')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      idx   = elasticlunr.Index.load(data);
      store = data.documentStore.docs;
      document.getElementById('search-status').textContent = 'Ready — start typing above.';
    })
    .catch(function() {
      document.getElementById('search-status').textContent = 'Search index could not be loaded.';
    });

  document.getElementById('search-input').addEventListener('input', function() {
    var q = this.value.trim();
    var list = document.getElementById('search-results');
    var status = document.getElementById('search-status');
    list.innerHTML = '';

    if (!q || q.length < 2) {
      status.textContent = q ? 'Keep typing…' : 'Ready — start typing above.';
      return;
    }
    if (!idx) { status.textContent = 'Index still loading…'; return; }

    var results = idx.search(q, { expand: true });
    if (!results.length) {
      status.textContent = 'No results for "' + q + '".';
      return;
    }

    status.textContent = results.length + ' result' + (results.length !== 1 ? 's' : '');
    results.forEach(function(r) {
      var doc = store[r.ref];
      if (!doc) return;
      var title = doc.title || '';
      var isUntitled = !title || title === 'Untitled' || title === '(No title)' || title === '(Untitled)';
      var snippet = (doc.body || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      var label = isUntitled ? '✦ ' + (snippet || 'Untitled post') : title;
      var href = safeSearchHref(doc.id || r.ref);
      if (!href) return;
      var li = document.createElement('li');
      li.className = 'search-result';
      var anchor = document.createElement('a');
      anchor.href = href;
      anchor.textContent = label;
      li.appendChild(anchor);
      if (snippet) {
        var summary = document.createElement('p');
        summary.textContent = snippet + '…';
        li.appendChild(summary);
      }
      list.appendChild(li);
    });
  });
})();

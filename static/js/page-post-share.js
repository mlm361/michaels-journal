// JOURNAL-CSP-01 Phase 3 step 3: Post Share and Listening cards (was inline post-share.1).
(function () {
  // Copy link
  var copyBtn = document.querySelector('.iw-post-cards .iw-copy-link');
  if (copyBtn && navigator.clipboard && navigator.clipboard.writeText) {
    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(copyBtn.dataset.shareUrl).then(function () {
        var o = copyBtn.textContent; copyBtn.textContent = '✓ Copied!';
        setTimeout(function () { copyBtn.textContent = o; }, 2000);
      }).catch(function () {});
    });
  } else if (copyBtn) {
    copyBtn.addEventListener('click', function () { window.prompt('Copy this link:', copyBtn.dataset.shareUrl); });
  }
  // Native OS share — only when supported
  var nativeBtn = document.querySelector('.iw-post-cards .iw-share-native');
  if (nativeBtn && typeof navigator.share === 'function') {
    nativeBtn.style.display = 'inline-flex';
    nativeBtn.addEventListener('click', function () {
      navigator.share({ title: nativeBtn.dataset.shareTitle, url: nativeBtn.dataset.shareUrl }).catch(function () {});
    });
  }

  // Listening (ListenBrainz)
  var USER = 'MLM361';
  var box = document.getElementById('iw-post-listens');
  if (!box) return;
  function rel(ts){
    if (!ts) return '';
    var diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return 'just now';
    var m = Math.floor(diff / 60); if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    var d = Math.floor(h / 24); if (d < 7) return d + 'd ago';
    var w = Math.floor(d / 7); if (w < 5) return w + 'w ago';
    return new Date(ts * 1000).toLocaleDateString();
  }
  function esc(s){ var e = document.createElement('div'); e.textContent = (s == null ? '' : String(s)); return e.innerHTML; }
  function clean(s){ return (s || '').replace(/^null:\s*/i, '').trim(); }
  function cover(mm){
    if (!mm || !mm.caa_release_mbid || !mm.caa_id) return null;
    var releaseId = String(mm.caa_release_mbid);
    var coverId = String(mm.caa_id);
    if (!/^[0-9a-f-]{36}$/i.test(releaseId) || !/^\d+$/.test(coverId)) return null;
    return 'https://coverartarchive.org/release/' + releaseId + '/' + coverId + '-250.jpg';
  }
  function row(listen, isNow){
    var t = listen.track_metadata || {}, mm = t.mbid_mapping || {}, src = cover(mm);
    var img = src ? '<img class="iw-cover" src="' + esc(src) + '" alt="" loading="lazy">' : '';
    var when = isNow ? '<span class="iw-now-tag">▶ Now playing</span>' : '<span class="iw-when">' + esc(rel(listen.listened_at)) + '</span>';
    return '<div class="iw-listen"><span class="iw-cover-wrap"><span class="iw-cover-ph"><i class="fas fa-music"></i></span>' + img + '</span>'
      + '<span class="iw-listen-meta"><div class="iw-track">' + esc(clean(t.track_name)) + '</div><div class="iw-artist">' + esc(t.artist_name || '') + '</div>' + when + '</span></div>';
  }
  function listensOf(j){ return (j && j.payload && j.payload.listens) ? j.payload.listens : []; }
  function getJson(u){ return fetch(u).then(function (r){ return r.ok ? r.json() : null; }).catch(function (){ return null; }); }
  // A cover that fails to load is removed, so the music-note placeholder behind it shows.
  // This replaces the old inline onerror handler on each cover. Error events do not bubble, so
  // listen in the capture phase; the listener exists before any cover is inserted.
  box.addEventListener('error', function (event) {
    var t = event.target;
    if (t && t.tagName === 'IMG' && t.classList.contains('iw-cover')) t.remove();
  }, true);
  Promise.all([
    getJson('https://api.listenbrainz.org/1/user/' + USER + '/playing-now'),
    getJson('https://api.listenbrainz.org/1/user/' + USER + '/listens?count=5')
  ]).then(function (res){
    var html = '';
    var pn = listensOf(res[0]); if (pn.length) html += row(pn[0], true);
    listensOf(res[1]).forEach(function (l){ html += row(l, false); });
    box.innerHTML = html || '<p class="iw-listens-msg">No recent listens.</p>';
  }).catch(function (){ box.innerHTML = '<p class="iw-listens-msg">Couldn\'t load listens right now.</p>'; });
})();

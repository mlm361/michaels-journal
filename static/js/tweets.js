(function () {
  'use strict';

  const HANDLE = 'mlm361';
  const DATA_URL = '/tweets-data/tweets.json';
  const MEDIA_BASE = '/tweets/media/';
  const PAGE_SIZE = 50;
  const SEARCH_DEBOUNCE = 150;

  const state = {
    all: [],
    filtered: [],
    rendered: 0,
    type: 'all',
    year: '',
    month: '',
    query: '',
  };

  const $ = (id) => document.getElementById(id);

  function decodeHtml(s) {
    if (!s) return '';
    const t = document.createElement('textarea');
    t.innerHTML = s;
    return t.value;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseTweets(raw) {
    const out = [];
    for (const item of raw) {
      const t = item && item.tweet;
      if (!t || !t.id_str) continue;
      const createdAt = new Date(t.created_at);
      const text = decodeHtml(t.full_text || '');
      const isRetweet = /^RT @\w+:/.test(text) || t.retweeted === true;
      const isReply = !!t.in_reply_to_status_id_str || !!t.in_reply_to_user_id_str;
      const entities = t.entities || {};
      const media = Array.isArray(entities.media) ? entities.media : [];
      const extendedMedia = (t.extended_entities && Array.isArray(t.extended_entities.media)) ? t.extended_entities.media : media;
      const urls = Array.isArray(entities.urls) ? entities.urls : [];

      out.push({
        id: t.id_str,
        date: createdAt,
        year: createdAt.getUTCFullYear(),
        month: createdAt.getUTCMonth() + 1,
        text,
        searchText: text.toLowerCase(),
        isRetweet,
        isReply,
        media: extendedMedia,
        urls,
        mentions: Array.isArray(entities.user_mentions) ? entities.user_mentions : [],
        hashtags: Array.isArray(entities.hashtags) ? entities.hashtags : [],
        favCount: parseInt(t.favorite_count, 10) || 0,
        rtCount: parseInt(t.retweet_count, 10) || 0,
        source: extractSourceName(t.source || ''),
      });
    }
    out.sort((a, b) => b.date - a.date);
    return out;
  }

  function extractSourceName(html) {
    const m = html.match(/>([^<]+)</);
    return m ? m[1] : '';
  }

  function applyFilters() {
    const q = state.query.trim().toLowerCase();
    state.filtered = state.all.filter((t) => {
      if (state.year && t.year !== parseInt(state.year, 10)) return false;
      if (state.month && t.month !== parseInt(state.month, 10)) return false;
      if (state.type === 'retweets' && !t.isRetweet) return false;
      if (state.type === 'replies' && !t.isReply) return false;
      if (state.type === 'media' && t.media.length === 0) return false;
      if (state.type === 'links' && t.urls.length === 0) return false;
      if (q && !t.searchText.includes(q)) return false;
      return true;
    });
    state.rendered = 0;
    renderList(true);
    updateCount();
  }

  function updateCount() {
    $('tweets-loading').hidden = true;
    const ct = $('tweets-count-text');
    ct.hidden = false;
    $('tweets-shown').textContent = Math.min(state.rendered, state.filtered.length).toLocaleString();
    $('tweets-total').textContent = state.filtered.length.toLocaleString();
  }

  function renderList(reset) {
    const list = $('tweets-list');
    if (reset) {
      list.innerHTML = '';
      state.rendered = 0;
    }

    if (state.filtered.length === 0) {
      list.innerHTML = '<div class="tweets-empty">No tweets match these filters.</div>';
      list.setAttribute('aria-busy', 'false');
      $('tweets-load-more').hidden = true;
      return;
    }

    const start = state.rendered;
    const end = Math.min(start + PAGE_SIZE, state.filtered.length);
    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      frag.appendChild(renderCard(state.filtered[i]));
    }
    list.appendChild(frag);
    state.rendered = end;
    list.setAttribute('aria-busy', 'false');

    $('tweets-load-more').hidden = state.rendered >= state.filtered.length;
    updateCount();
  }

  function renderCard(t) {
    const card = document.createElement('article');
    card.className = 'tweet-card';

    const header = document.createElement('header');
    header.className = 'tweet-card-header';

    if (t.isRetweet) {
      header.appendChild(iconSvg('M23 8.5l-3-3-1.4 1.4L20.2 8H7v2h13.2l-1.6 1.1L20 12.5l3-3zM4 13.5l3 3 1.4-1.4L6.8 14H20v-2H6.8l1.6-1.1L7 9.5l-3 4z', 'tweet-card-type-icon'));
      const span = document.createElement('span');
      span.textContent = 'Retweet';
      header.appendChild(span);
    } else if (t.isReply) {
      header.appendChild(iconSvg('M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z', 'tweet-card-type-icon'));
      const span = document.createElement('span');
      span.textContent = 'Reply';
      header.appendChild(span);
    } else {
      header.appendChild(iconSvg('M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z', 'tweet-card-type-icon'));
      const span = document.createElement('span');
      span.textContent = '@' + HANDLE;
      header.appendChild(span);
    }

    const timeWrap = document.createElement('span');
    timeWrap.className = 'tweet-card-time';
    const timeLink = document.createElement('a');
    timeLink.href = 'https://twitter.com/' + HANDLE + '/status/' + t.id;
    timeLink.rel = 'noopener noreferrer';
    timeLink.target = '_blank';
    const time = document.createElement('time');
    time.dateTime = t.date.toISOString();
    time.textContent = formatDate(t.date);
    timeLink.appendChild(time);
    timeWrap.appendChild(timeLink);
    header.appendChild(timeWrap);

    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'tweet-card-body';
    body.innerHTML = linkify(t.text, t.urls);
    card.appendChild(body);

    if (t.media.length > 0) {
      const mediaWrap = document.createElement('div');
      mediaWrap.className = 'tweet-card-media';
      for (const m of t.media) {
        mediaWrap.appendChild(renderMedia(t.id, m));
      }
      card.appendChild(mediaWrap);
    }

    if (t.favCount > 0 || t.rtCount > 0) {
      const stats = document.createElement('div');
      stats.className = 'tweet-card-stats';
      if (t.rtCount > 0) {
        const s = document.createElement('span');
        s.className = 'tweet-card-stat';
        s.appendChild(iconSvg('M23 8.5l-3-3-1.4 1.4L20.2 8H7v2h13.2l-1.6 1.1L20 12.5l3-3zM4 13.5l3 3 1.4-1.4L6.8 14H20v-2H6.8l1.6-1.1L7 9.5l-3 4z'));
        const c = document.createElement('span');
        c.textContent = t.rtCount.toLocaleString();
        s.appendChild(c);
        stats.appendChild(s);
      }
      if (t.favCount > 0) {
        const s = document.createElement('span');
        s.className = 'tweet-card-stat';
        s.appendChild(iconSvg('M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'));
        const c = document.createElement('span');
        c.textContent = t.favCount.toLocaleString();
        s.appendChild(c);
        stats.appendChild(s);
      }
      card.appendChild(stats);
    }

    if (t.source) {
      const src = document.createElement('div');
      src.className = 'tweet-card-source';
      src.textContent = 'via ' + t.source;
      card.appendChild(src);
    }

    return card;
  }

  function iconSvg(d, cls) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (cls) svg.setAttribute('class', cls);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
  }

  function renderMedia(tweetId, m) {
    const filename = basenameFromUrl(m.media_url_https || m.media_url || '');
    if (!filename) {
      const placeholder = document.createElement('div');
      placeholder.style.padding = '0.5rem';
      placeholder.style.fontSize = '0.75rem';
      placeholder.style.opacity = '0.5';
      placeholder.textContent = '[media missing]';
      return placeholder;
    }
    const type = m.type || 'photo';
    if (type === 'video' || type === 'animated_gif') {
      const variants = (m.video_info && Array.isArray(m.video_info.variants)) ? m.video_info.variants : [];
      const mp4 = variants
        .filter((v) => v.content_type === 'video/mp4' && v.url)
        .sort((a, b) => (parseInt(b.bitrate, 10) || 0) - (parseInt(a.bitrate, 10) || 0))[0];
      const videoFilename = mp4 ? basenameFromUrl(mp4.url.split('?')[0]) : filename;
      const videoSrc = MEDIA_BASE + tweetId + '-' + videoFilename;

      const video = document.createElement('video');
      video.controls = true;
      video.preload = 'metadata';
      video.playsInline = true;
      video.volume = 0.5;
      if (type === 'animated_gif') {
        video.loop = true;
        video.muted = true;
      }
      const source = document.createElement('source');
      source.src = videoSrc;
      source.type = 'video/mp4';
      video.appendChild(source);
      return video;
    }

    const img = document.createElement('img');
    img.src = MEDIA_BASE + tweetId + '-' + archiveImageFilename(filename);
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    return img;
  }

  function archiveImageFilename(filename) {
    return String(filename || '').replace(/\.(jpe?g|png|webp)$/i, '.avif');
  }

  function basenameFromUrl(url) {
    if (!url) return '';
    const clean = url.split('?')[0];
    const parts = clean.split('/');
    return parts[parts.length - 1] || '';
  }

  function linkify(text, urlEntities) {
    let html = escapeHtml(text);
    html = html.replace(/(^|[\s(])@(\w{1,15})/g, function (_m, lead, name) {
      return lead + '<a class="mention" href="https://twitter.com/' + name + '" rel="noopener noreferrer" target="_blank">@' + name + '</a>';
    });
    html = html.replace(/(^|[\s(])#(\w+)/g, function (_m, lead, tag) {
      return lead + '<a class="hashtag" href="https://twitter.com/hashtag/' + encodeURIComponent(tag) + '" rel="noopener noreferrer" target="_blank">#' + tag + '</a>';
    });
    if (Array.isArray(urlEntities)) {
      for (const u of urlEntities) {
        if (!u.url) continue;
        const escapedShort = escapeHtml(u.url);
        const display = escapeHtml(u.display_url || u.expanded_url || u.url);
        const target = escapeHtml(u.expanded_url || u.url);
        html = html.split(escapedShort).join('<a class="link" href="' + target + '" rel="noopener noreferrer" target="_blank">' + display + '</a>');
      }
    }
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function formatDate(d) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const hh = d.getUTCHours();
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const h12 = ((hh + 11) % 12) + 1;
    const ampm = hh < 12 ? 'AM' : 'PM';
    return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear() + ', ' + h12 + ':' + mm + ' ' + ampm;
  }

  function buildYearOptions() {
    const sel = $('filter-year');
    const years = new Set();
    for (const t of state.all) years.add(t.year);
    const sorted = Array.from(years).sort((a, b) => b - a);
    for (const y of sorted) {
      const o = document.createElement('option');
      o.value = String(y);
      o.textContent = String(y);
      sel.appendChild(o);
    }
  }

  function wireEvents() {
    $('filter-year').addEventListener('change', (e) => {
      state.year = e.target.value;
      applyFilters();
    });
    $('filter-month').addEventListener('change', (e) => {
      state.month = e.target.value;
      applyFilters();
    });
    $('filter-clear-dates').addEventListener('click', () => {
      state.year = '';
      state.month = '';
      $('filter-year').value = '';
      $('filter-month').value = '';
      applyFilters();
    });

    let searchTimer = null;
    $('filter-search').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      const v = e.target.value;
      searchTimer = setTimeout(() => {
        state.query = v;
        applyFilters();
      }, SEARCH_DEBOUNCE);
    });

    const pills = document.querySelectorAll('.tweets-pill');
    pills.forEach((p) => {
      p.addEventListener('click', () => {
        pills.forEach((x) => {
          x.classList.remove('is-active');
          x.setAttribute('aria-selected', 'false');
        });
        p.classList.add('is-active');
        p.setAttribute('aria-selected', 'true');
        state.type = p.dataset.type || 'all';
        applyFilters();
      });
    });

    $('tweets-load-more').addEventListener('click', () => renderList(false));
  }

  function showError(msg) {
    const list = $('tweets-list');
    list.innerHTML = '<div class="tweets-empty">' + escapeHtml(msg) + '</div>';
    list.setAttribute('aria-busy', 'false');
    $('tweets-loading').textContent = 'Failed to load tweets.';
  }

  async function init() {
    try {
      const res = await fetch(DATA_URL, { credentials: 'omit' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.json();
      state.all = parseTweets(raw);
      state.filtered = state.all.slice();
      buildYearOptions();
      wireEvents();
      renderList(true);
    } catch (err) {
      console.error('tweets.js init failed:', err);
      showError('Could not load tweets.json. Please refresh.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

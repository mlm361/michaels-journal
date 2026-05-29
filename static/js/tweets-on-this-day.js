(function () {
  'use strict';

  const HANDLE = 'mlm361';
  const DATA_URL = '/tweets-data/tweets.json';
  const MEDIA_BASE = '/tweets/media/';
  const EMPTY_IMAGE = '/img/twitter-archive-fail-whale.avif';
  const SITE_TZ = 'America/New_York';

  const root = document.getElementById('tweets-on-this-day');
  const dateLabel = document.getElementById('tweets-otd-date-label');

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function decodeHtml(s) {
    const t = document.createElement('textarea');
    t.innerHTML = s || '';
    return t.value;
  }

  function tzParts(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: SITE_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: map.hour,
      minute: map.minute,
      dayPeriod: map.dayPeriod,
    };
  }

  function dateDisplay(date) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: SITE_TZ,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  function todayLabel(date) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: SITE_TZ,
      month: 'long',
      day: 'numeric',
    }).format(date);
  }

  function extractSourceName(html) {
    const match = String(html || '').match(/>([^<]+)</);
    return match ? match[1] : '';
  }

  function parseTweets(raw) {
    const tweets = [];
    for (const item of raw || []) {
      const t = item && item.tweet;
      if (!t || !t.id_str || !t.created_at) continue;
      const date = new Date(t.created_at);
      if (Number.isNaN(date.getTime())) continue;

      const text = decodeHtml(t.full_text || '');
      const entities = t.entities || {};
      const media = t.extended_entities && Array.isArray(t.extended_entities.media)
        ? t.extended_entities.media
        : Array.isArray(entities.media)
          ? entities.media
          : [];
      const urls = Array.isArray(entities.urls) ? entities.urls : [];
      const parts = tzParts(date);

      tweets.push({
        id: t.id_str,
        date,
        year: parts.year,
        month: parts.month,
        day: parts.day,
        text,
        isRetweet: /^RT @\w+:/.test(text) || t.retweeted === true,
        isReply: !!t.in_reply_to_status_id_str || !!t.in_reply_to_user_id_str,
        media,
        urls,
        favCount: parseInt(t.favorite_count, 10) || 0,
        rtCount: parseInt(t.retweet_count, 10) || 0,
        source: extractSourceName(t.source || ''),
      });
    }
    return tweets;
  }

  function iconSvg(pathData) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + pathData + '"></path></svg>';
  }

  function typeIcon(tweet) {
    if (tweet.isRetweet) return iconSvg('M23 8.5l-3-3-1.4 1.4L20.2 8H7v2h13.2l-1.6 1.1L20 12.5l3-3zM4 13.5l3 3 1.4-1.4L6.8 14H20v-2H6.8l1.6-1.1L7 9.5l-3 4z') + '<span>Retweet</span>';
    if (tweet.isReply) return iconSvg('M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z') + '<span>Reply</span>';
    return iconSvg('M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z') + '<span>@' + HANDLE + '</span>';
  }

  function basenameFromUrl(url) {
    const clean = String(url || '').split('?')[0];
    const parts = clean.split('/');
    return parts[parts.length - 1] || '';
  }

  function isTwitterUrl(url) {
    return /^https?:\/\/(www\.|mobile\.)?(twitter\.com|x\.com|t\.co)(\/|$)/i.test(url || '');
  }

  // The bare t.co link Twitter appends for attached photos/videos is dead
  // clutter now that the media is rendered inline, so drop it from the text.
  function stripMediaShortlinks(text, media) {
    let out = text || '';
    for (const m of media || []) {
      if (m && m.url) out = out.split(m.url).join('');
    }
    return out.replace(/[ \t]+\n/g, '\n').replace(/\s+$/, '');
  }

  function linkify(text, urlEntities) {
    let html = escapeHtml(text);
    // Mentions and hashtags only resolve to Twitter/X, which no longer hosts
    // this account, so render them as plain text rather than dead links.
    html = html.replace(/(^|[\s(])@(\w{1,15})/g, '$1@$2');
    html = html.replace(/(^|[\s(])#(\w+)/g, '$1#$2');
    for (const u of urlEntities || []) {
      if (!u.url) continue;
      const display = escapeHtml(u.display_url || u.expanded_url || u.url);
      const target = u.expanded_url || u.url;
      const replacement = isTwitterUrl(target)
        ? display
        : '<a href="' + escapeHtml(target) + '" rel="noopener noreferrer" target="_blank">' + display + '</a>';
      html = html.split(escapeHtml(u.url)).join(replacement);
    }
    return html.replace(/\n/g, '<br>');
  }

  function mediaHtml(tweet) {
    if (!tweet.media.length) return '';
    const pieces = [];
    for (const media of tweet.media) {
      const filename = basenameFromUrl(media.media_url_https || media.media_url || '');
      if (!filename) continue;
      const type = media.type || 'photo';
      if (type === 'video' || type === 'animated_gif') {
        const variants = media.video_info && Array.isArray(media.video_info.variants) ? media.video_info.variants : [];
        const mp4 = variants
          .filter((v) => v.content_type === 'video/mp4' && v.url)
          .sort((a, b) => (parseInt(b.bitrate, 10) || 0) - (parseInt(a.bitrate, 10) || 0))[0];
        const videoFilename = mp4 ? basenameFromUrl(mp4.url) : filename;
        const attrs = type === 'animated_gif' ? ' controls loop muted playsinline preload="metadata"' : ' controls playsinline preload="metadata"';
        pieces.push('<video' + attrs + '><source src="' + MEDIA_BASE + tweet.id + '-' + encodeURIComponent(videoFilename) + '" type="video/mp4"></video>');
      } else {
        pieces.push('<img src="' + MEDIA_BASE + tweet.id + '-' + encodeURIComponent(archiveImageFilename(filename)) + '" alt="" loading="lazy" decoding="async">');
      }
    }
    return pieces.length ? '<div class="tweets-otd-media">' + pieces.join('') + '</div>' : '';
  }

  function archiveImageFilename(filename) {
    return String(filename || '').replace(/\.(jpe?g|png|webp)$/i, '.avif');
  }

  function statsHtml(tweet) {
    const parts = [];
    if (tweet.favCount > 0) {
      parts.push('<span class="tweets-otd-stat">' + iconSvg('M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z') + '<span>' + tweet.favCount.toLocaleString() + '</span></span>');
    }
    if (tweet.rtCount > 0) {
      parts.push('<span class="tweets-otd-stat">' + iconSvg('M23 8.5l-3-3-1.4 1.4L20.2 8H7v2h13.2l-1.6 1.1L20 12.5l3-3zM4 13.5l3 3 1.4-1.4L6.8 14H20v-2H6.8l1.6-1.1L7 9.5l-3 4z') + '<span>' + tweet.rtCount.toLocaleString() + '</span></span>');
    }
    return parts.length ? '<div class="tweets-otd-stats">' + parts.join('') + '</div>' : '';
  }

  function cardHtml(tweet) {
    return [
      '<article class="tweets-otd-card">',
      '<header class="tweets-otd-card-header">',
      typeIcon(tweet),
      '<time datetime="' + tweet.date.toISOString() + '">' + escapeHtml(dateDisplay(tweet.date)) + '</time>',
      '</header>',
      '<div class="tweets-otd-body">' + linkify(stripMediaShortlinks(tweet.text, tweet.media), tweet.urls) + '</div>',
      mediaHtml(tweet),
      statsHtml(tweet),
      tweet.source ? '<div class="tweets-otd-summary">via ' + escapeHtml(tweet.source) + '</div>' : '',
      '</article>',
    ].join('');
  }

  function showEmpty(label) {
    root.innerHTML = [
      '<div class="tweets-otd-empty">',
      '<img src="' + EMPTY_IMAGE + '" width="1254" height="1254" alt="No tweets found for today in the Twitter archive.">',
      '<p>No tweets from past years were found for ' + escapeHtml(label) + '.</p>',
      '</div>',
    ].join('');
  }

  function render(matches, label) {
    if (!matches.length) {
      showEmpty(label);
      return;
    }
    matches.sort((a, b) => b.date - a.date);
    const groups = new Map();
    for (const tweet of matches) {
      if (!groups.has(tweet.year)) groups.set(tweet.year, []);
      groups.get(tweet.year).push(tweet);
    }
    const years = Array.from(groups.keys()).sort((a, b) => b - a);
    const html = ['<p class="tweets-otd-summary">Found <strong>' + matches.length.toLocaleString() + '</strong> tweet' + (matches.length === 1 ? '' : 's') + ' from past years for ' + escapeHtml(label) + '.</p>'];
    for (const year of years) {
      html.push('<h2 class="tweets-otd-year">' + year + '</h2>');
      for (const tweet of groups.get(year)) html.push(cardHtml(tweet));
    }
    root.innerHTML = html.join('');
  }

  async function init() {
    if (!root) return;
    const now = new Date();
    const today = tzParts(now);
    const label = todayLabel(now);
    if (dateLabel) {
      dateLabel.textContent = label + ' in past years';
    }
    try {
      const response = await fetch(DATA_URL, { credentials: 'omit' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const tweets = parseTweets(await response.json());
      const matches = tweets.filter((tweet) => tweet.year !== today.year && tweet.month === today.month && tweet.day === today.day);
      render(matches, label);
    } catch (error) {
      console.error('Tweets On This Day failed:', error);
      root.innerHTML = '<p class="tweets-otd-loading">Could not load the Twitter archive. Please refresh.</p>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

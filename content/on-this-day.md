+++
title = "On This Day"
date = 2025-01-01
template = "page.html"
[extra]
no_kudos = true
skip_feed = true
extra_css = ["/css/on-this-day.css"]
+++

<p class="otd-subpage-link"><a href="/on-this-day/tweets/"><svg class="otd-twitter-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M23.64 4.94c-.84.37-1.73.62-2.68.73.96-.58 1.7-1.49 2.05-2.58-.9.53-1.9.92-2.96 1.13-.85-.9-2.06-1.47-3.4-1.47-2.57 0-4.66 2.09-4.66 4.66 0 .36.04.72.12 1.06-3.87-.2-7.3-2.05-9.6-4.87-.4.69-.63 1.49-.63 2.34 0 1.62.82 3.04 2.07 3.88-.76-.03-1.48-.23-2.11-.58v.06c0 2.26 1.61 4.14 3.74 4.57-.39.11-.8.16-1.23.16-.3 0-.59-.03-.88-.08.59 1.85 2.31 3.2 4.35 3.23-1.6 1.25-3.6 2-5.79 2-.38 0-.75-.02-1.11-.07 2.06 1.32 4.51 2.09 7.14 2.09 8.57 0 13.26-7.1 13.26-13.25 0-.2 0-.4-.01-.6.91-.66 1.7-1.48 2.32-2.41z"/></svg><span>View Tweets On This Day</span></a></p>

<div id="on-this-day">Loading...</div>

<script>
document.addEventListener('DOMContentLoaded', async () => {
  const onThisDay = document.getElementById('on-this-day');

  const POST_INDEX_URL   = '/post-index.json';
  const SITE_TZ          = 'America/New_York';
  const SHOW_TZ_NOTE     = true;
  const TZ_NOTE_TEXT     = "Dates are matched in Michael's local time (America/New_York).";
  const FETCH_BATCH_SIZE = 6;

  function sanitize(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll(
      '.p-author,.mf2-hidden,.frontmatter_page,.post-response,.webmentions,.article_title,.note-meta'
    ).forEach(el => el.remove());
    tmp.querySelectorAll('script,style,iframe,object,embed,form,input,button')
       .forEach(el => el.remove());
    tmp.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(attr => {
        if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
      });
      if (el.href && el.href.startsWith('javascript:')) el.removeAttribute('href');
      if (el.src  && el.src.startsWith('javascript:'))  el.removeAttribute('src');
    });
    return tmp.innerHTML;
  }

  function escapeHTML(text) {
    const tmp = document.createElement('div');
    tmp.textContent = text || '';
    return tmp.innerHTML;
  }

  function isPlaceholderTitle(title) {
    const t = (title || '').trim().toLowerCase();
    return !t || t === 'untitled' || t === '(no title)' || t === '(untitled)';
  }

  function textFromHTML(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function excerptFromHTML(html, fallback) {
    const text = textFromHTML(html) || (fallback || '').replace(/\s+/g, ' ').trim();
    if (!text) return 'View note';
    const sentence = text.match(/^.{24,}?[.!?](?:\s|$)/);
    const picked = sentence ? sentence[0].trim() : text;
    return picked.length > 140 ? picked.slice(0, 137).replace(/\s+\S*$/, '') + '...' : picked;
  }

  function tzParts(date) {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: SITE_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const m = Object.fromEntries(p.map(x => [x.type, x.value]));
    return { yyyy: +m.year, mm: +m.month, dd: +m.day };
  }

  function todayParts() { return tzParts(new Date()); }

  function displayNoPostsMessage() {
    onThisDay.innerHTML = `
      <div style="text-align:center;padding:20px;">
        <img src="/img/no-posts-on-this-day.png"
             width="600" height="600"
             alt="Sorry, no posts from yesteryear for today's date."
             style="max-width:100%;height:auto;border:2px solid #ccc;border-radius:8px;">
        <p style="font-size:1.2em;font-weight:bold;color:#555;">
          Sorry, no posts from yesteryear for today's date.
        </p>
      </div>`;
  }

  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  async function fetchPostHTML(item) {
    try {
      const r = await fetch(item.url, { credentials: 'same-origin' });
      if (!r.ok) return null;
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');

      const timeEl = doc.querySelector('time.dt-published[datetime], time[datetime]');
      const dt     = timeEl ? timeEl.getAttribute('datetime') : null;
      const dateObj = dt ? new Date(dt) : null;
      const titleEl = doc.querySelector('.article_title a, h1 a, h1, .p-name');
      const rawTitle = (item.title || (titleEl ? titleEl.textContent : '') || '').trim();
      const title = isPlaceholderTitle(rawTitle) ? '' : rawTitle;

      // Pull only the authored post body. Copying the whole article drags in
      // hidden microformats author markup, response controls, and metadata;
      // once pasted into this utility page, that "hidden" avatar is not hidden.
      const selectors = [
        'article .e-content',
        '.h-entry .e-content',
        '.note-body.e-content',
        '.post-content',
      ];
      let content = '';
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) { content = el.innerHTML; break; }
      }
      if (!content) {
        const fallback = doc.querySelector('article');
        if (fallback) {
          const clone = fallback.cloneNode(true);
          clone.querySelectorAll(
            '.p-author,.mf2-hidden,.frontmatter_page,.post-response,.webmentions,.article_title,.note-meta'
          ).forEach(el => el.remove());
          content = clone.innerHTML;
        }
      }

      return {
        url: item.url,
        title,
        dateObj,
        content,
        indexExcerpt: item.excerpt || '',
        isNote: item.is_note === undefined ? String(item.url || '').includes('/notes/') : !!item.is_note,
        isUntitled: item.is_untitled === undefined ? !title : !!item.is_untitled
      };
    } catch {
      return null;
    }
  }

  async function run() {
    const { mm, dd, yyyy: currentYear } = todayParts();

    let items;
    try {
      const r = await fetch(POST_INDEX_URL, { credentials: 'same-origin' });
      if (!r.ok) throw new Error('Post index not available');
      items = await r.json();
    } catch (e) {
      displayNoPostsMessage();
      console.error('On This Day: failed to load post index', e);
      return;
    }

    if (!items.length) { displayNoPostsMessage(); return; }

    const candidates = items.filter(item => {
      if (!item.date) return false;
      const d = new Date(item.date + 'T12:00:00');
      if (isNaN(d)) return false;
      const parts = tzParts(d);
      return parts.yyyy !== currentYear && parts.mm === mm && parts.dd === dd;
    });

    if (!candidates.length) { displayNoPostsMessage(); return; }

    const batches = chunk(candidates, FETCH_BATCH_SIZE);
    const posts   = [];

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(item => fetchPostHTML(item))
      );
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status !== 'fulfilled' || !r.value) continue;
        const post    = r.value;
        const dateObj = post.dateObj || new Date(batch[i].date + 'T12:00:00');
        const displayDate = new Intl.DateTimeFormat('en-US', {
          timeZone: SITE_TZ,
          year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(dateObj);
        const cleanContent = sanitize(post.content || '');
        posts.push({
          url: post.url,
          title: post.title,
          excerpt: excerptFromHTML(cleanContent, post.indexExcerpt),
          isNote: post.isNote,
          isUntitled: post.isUntitled,
          dateObj,
          content: cleanContent,
          displayDate
        });
      }
    }

    if (!posts.length) { displayNoPostsMessage(); return; }

    posts.sort((a, b) => tzParts(b.dateObj).yyyy - tzParts(a.dateObj).yyyy);

    onThisDay.innerHTML = '<h2>Posts on This Day in Past Years</h2>';
    if (SHOW_TZ_NOTE) {
      onThisDay.insertAdjacentHTML('beforeend',
        `<p style="margin:-6px 0 12px;color:#666;font-size:.95em;">${TZ_NOTE_TEXT}</p>`
      );
    }

    const seen = new Set();
    for (const p of posts) {
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      const heading = p.title
        ? `<h3 class="otd-title"><a href="${p.url}">${escapeHTML(p.title)}</a></h3>`
        : p.isNote
          ? `<a class="otd-note-title" href="${p.url}">${escapeHTML(p.excerpt)}</a>`
          : `<h3 class="otd-title otd-untitled-title"><a href="${p.url}"><span aria-hidden="true">✦</span><span class="sr-only">Untitled post: </span> ${escapeHTML(p.excerpt)}</a></h3>`;
      onThisDay.insertAdjacentHTML('beforeend', `
        <article class="otd-entry${p.isNote ? ' otd-note' : ''}">
          <a class="otd-date" href="${p.url}">${p.displayDate}</a>
          ${heading}
          <div class="otd-content">${p.content}</div>
        </article>
      `);
    }
  }

  try { await run(); } catch { displayNoPostsMessage(); }
});
</script>

+++
title = "On This Day"
date = 2025-01-01
template = "page.html"
[extra]
no_kudos = true
+++

<div id="on-this-day">Loading...</div>

<script>
document.addEventListener('DOMContentLoaded', async () => {
  const onThisDay = document.getElementById('on-this-day');

  const JSON_FEED_URL    = '/feed.json';
  const SITE_TZ          = 'America/New_York';
  const SHOW_TZ_NOTE     = true;
  const TZ_NOTE_TEXT     = "Dates are matched in Michael's local time (America/New_York).";
  const FETCH_BATCH_SIZE = 6;

  function sanitize(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
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

  async function fetchPostHTML(url) {
    try {
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) return null;
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');

      const timeEl = doc.querySelector('time.dt-published[datetime], time[datetime]');
      const dt     = timeEl ? timeEl.getAttribute('datetime') : null;
      const dateObj = dt ? new Date(dt) : null;

      // Ergo theme: content lives inside section.post_container article
      const selectors = [
        'section.post_container article',
        'article .e-content',
        '.h-entry .e-content',
        '.post-content',
        'article',
        '.h-entry'
      ];
      let content = '';
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) { content = el.innerHTML; break; }
      }

      return { url, dateObj, content };
    } catch {
      return null;
    }
  }

  async function run() {
    const { mm, dd, yyyy: currentYear } = todayParts();

    let items;
    try {
      const r = await fetch(JSON_FEED_URL, { credentials: 'same-origin' });
      if (!r.ok) throw new Error('JSON feed not available');
      const data = await r.json();
      items = data.items || [];
    } catch (e) {
      displayNoPostsMessage();
      console.error('On This Day: failed to load JSON feed', e);
      return;
    }

    if (!items.length) { displayNoPostsMessage(); return; }

    const candidates = items.filter(item => {
      if (!item.date_published) return false;
      const d = new Date(item.date_published);
      if (isNaN(d)) return false;
      const parts = tzParts(d);
      return parts.yyyy !== currentYear && parts.mm === mm && parts.dd === dd;
    });

    if (!candidates.length) { displayNoPostsMessage(); return; }

    const batches = chunk(candidates, FETCH_BATCH_SIZE);
    const posts   = [];

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(item => fetchPostHTML(item.url || item.id))
      );
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status !== 'fulfilled' || !r.value) continue;
        const post    = r.value;
        const dateObj = post.dateObj || new Date(batch[i].date_published);
        const displayDate = new Intl.DateTimeFormat('en-US', {
          timeZone: SITE_TZ,
          year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(dateObj);
        posts.push({ url: post.url, dateObj, content: post.content, displayDate });
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
      onThisDay.insertAdjacentHTML('beforeend', `
        <article style="border-bottom:1px solid #ccc;padding:15px;margin-bottom:15px;">
          <h3><a href="${p.url}">${p.displayDate}</a></h3>
          <div>${sanitize(p.content)}</div>
        </article>
      `);
    }
  }

  try { await run(); } catch { displayNoPostsMessage(); }
});
</script>

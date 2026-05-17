+++
title = "Stats"
date = 2025-01-01
template = "page.html"
[extra]
no_kudos = true
skip_feed = true
+++

<div id="stats-page" class="stats-page">

  <div id="stats-loader" class="sl-wrap">
    <div class="sl-card">
      <div class="sl-icon">📊</div>
      <div class="sl-text">
        <div class="sl-title">Loading archive stats...</div>
        <div id="sl-phase" class="sl-phase">Fetching data...</div>
      </div>
      <div class="sl-bar"><div id="sl-fill" class="sl-fill"></div></div>
    </div>
  </div>

  <h3 class="stats-section-head">Archive Growth</h3>
  <div class="chart-wrap">
    <canvas id="stats-chart" aria-label="Entries per year, split by posts and notes"></canvas>
  </div>

  <h3 class="stats-section-head">Summary</h3>
  <div id="summary" class="stats-grid"></div>

  <h3 class="stats-section-head">Entry Mix</h3>
  <div id="entry-mix" class="stats-grid"></div>

  <h3 class="stats-section-head">Decades</h3>
  <div id="decades" class="stats-grid"></div>

  <div id="year-recap" class="stat-panel" style="display:none;"></div>

  <h3 class="stats-section-head">Images</h3>
  <div id="image-stats" class="stats-grid" style="display:none;"></div>

  <h3 class="stats-section-head">Year Breakdown</h3>
  <div id="picker-wrap" class="picker-wrap" style="display:none;">
    <label>Year:
      <select id="year-picker"></select>
    </label>
    <div id="year-summary" class="muted-line"></div>
  </div>
  <div id="monthly-grid" class="stats-grid" style="display:none;"></div>

  <h3 class="stats-section-head">Top Entries</h3>
  <div id="top-posts" class="top-grid" style="display:none;"></div>

  <h3 class="stats-section-head">Milestones</h3>
  <div id="milestones" class="stats-grid" style="display:none;"></div>

  <h3 class="stats-section-head">Reading Time</h3>
  <div id="reading" class="stats-grid" style="display:none;"></div>

  <h3 class="stats-section-head">Posting Streaks</h3>
  <div id="streaks" class="stats-grid" style="display:none;"></div>

  <p id="stats-foot" class="stats-foot"></p>
</div>

<style>
.stats-page { max-width: 980px; }
.stats-section-head { font-size:.8rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em; opacity:.45; margin:1.5rem 0 .6rem; }
.chart-wrap { position:relative; height:330px; margin:0 0 .5rem; }
.stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(175px,1fr)); gap:.85rem; margin:0 0 1.5rem; }
.top-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:1rem; margin:0 0 1.75rem; }
.stat-panel { border:1px solid rgba(128,128,128,.2); border-radius:12px; padding:1.1rem 1.4rem; margin:0 0 1.25rem; }
.sl-wrap  { margin:.5rem 0 1.25rem; }
.sl-card  { border:1px solid rgba(128,128,128,.2); border-radius:12px; background:rgba(128,128,128,.04); padding:14px 16px; display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
.sl-icon  { font-size:22px; }
.sl-title { font-weight:700; font-size:.95rem; }
.sl-phase { color:#555; font-size:.85rem; }
.sl-bar   { height:8px; background:rgba(128,128,128,.15); border-radius:8px; overflow:hidden; width:200px; margin-left:auto; }
.sl-fill  { height:100%; background:#4a90e2; border-radius:8px; transition:width .25s; width:0%; }
.stat-tile     { border:1px solid rgba(128,128,128,.2); border-radius:12px; padding:1rem 1.1rem; }
.stat-tile .tl { font-size:.85rem; color:#666; margin-bottom:.3rem; }
.stat-tile .tv { font-size:1.55rem; font-weight:700; line-height:1.2; }
.stat-tile .ts { font-size:.82rem; color:#666; margin-top:.25rem; }
.stat-tile a   { color:inherit; }
.mo-card       { border:1px solid rgba(128,128,128,.15); border-radius:10px; padding:.75rem; }
.mo-label      { font-weight:700; font-size:.8rem; margin-bottom:.2rem; }
.mo-count      { font-size:1.45rem; font-weight:700; line-height:1.2; }
.mo-sub        { font-size:.78rem; color:#666; margin-top:.15rem; }
.picker-wrap   { margin:0 0 .5rem; }
.picker-wrap label { font-size:.9rem; }
.picker-wrap select { margin-left:6px; padding:4px 8px; border-radius:6px; }
.muted-line, .stats-foot { color:#888; font-size:.84rem; }
.stats-foot { margin-top:1rem; }
.entry-list { margin:0; padding-left:1.3rem; line-height:1.75; font-size:.88rem; }
.entry-list span { color:#666; }
@media(max-width:600px){
  .sl-bar{width:120px;margin-left:0;margin-top:8px}
  .chart-wrap{height:300px}
}
</style>

<script>
(async function(){
  const LAUNCH  = new Date('2025-07-05T00:00:00Z');
  const WPM     = 200;
  const EXCLUDE = new Set(['/about/','/archive/','/on-this-day/','/stats/','/tweets/','/search/','/privacy/']);
  const MO_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const loaderEl = document.getElementById('stats-loader');
  const phaseEl  = document.getElementById('sl-phase');
  const fillEl   = document.getElementById('sl-fill');

  function progress(msg, pct) {
    phaseEl.textContent = msg;
    if (pct != null) fillEl.style.width = pct + '%';
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function plural(n, one, many) {
    return n === 1 ? one : (many || one + 's');
  }

  function entryLabel(entry) {
    if (entry.title) return entry.title;
    return entry.excerpt || (entry.isNote ? 'View note' : 'View entry');
  }

  function tile(label, value, sub, href) {
    const d = document.createElement('div');
    d.className = 'stat-tile';
    const safeLabel = escapeHTML(label);
    const safeValue = escapeHTML(value);
    const valueHtml = href
      ? `<div class="tv"><a href="${escapeHTML(href)}">${safeValue}</a></div>`
      : `<div class="tv">${safeValue}</div>`;
    d.innerHTML = `<div class="tl">${safeLabel}</div>${valueHtml}${sub ? `<div class="ts">${escapeHTML(sub)}</div>` : ''}`;
    return d;
  }

  function fmtDate(d) {
    if (!d) return '';
    const dt = (d instanceof Date) ? d : new Date(String(d).length === 10 ? d + 'T12:00:00' : d);
    return dt.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
  }

  function fmtUptime(ms) {
    const d = Math.floor(ms / 86400000);
    const y = Math.floor(d / 365);
    const rem = d % 365;
    const m = Math.floor(rem / 30);
    const dd = rem % 30;
    const parts = [];
    if (y) parts.push(y + 'y');
    if (m) parts.push(m + 'mo');
    if (dd || !parts.length) parts.push((dd || 0) + 'd');
    return parts.join(' ');
  }

  function calcStreaks(dates) {
    const days = [...new Set(dates.map(d => d.toISOString().slice(0,10)))].sort();
    if (!days.length) return {cur:0,cS:'',cE:'',max:0,mS:'',mE:''};
    let max = 1, mS = days[0], mE = days[0], run = 1, rS = days[0];
    for (let i = 1; i < days.length; i++) {
      const gap = (new Date(days[i]) - new Date(days[i-1])) / 86400000;
      if (gap === 1) {
        run++;
        if (run > max) { max = run; mS = rS; mE = days[i]; }
      } else {
        run = 1;
        rS = days[i];
      }
    }
    const today = new Date().toISOString().slice(0,10);
    const last = days[days.length - 1];
    const gapToday = (new Date(today) - new Date(last)) / 86400000;
    let cur = 0, cS = '', cE = '';
    if (gapToday <= 1) {
      cur = 1; cE = last; cS = last;
      for (let i = days.length - 2; i >= 0; i--) {
        if ((new Date(days[i+1]) - new Date(days[i])) / 86400000 === 1) {
          cur++;
          cS = days[i];
        } else {
          break;
        }
      }
    }
    return {cur,cS,cE,max,mS,mE};
  }

  function fmtStreak(s, e) {
    if (!s) return 'None yet';
    return s === e ? fmtDate(s) : `${fmtDate(s)} - ${fmtDate(e)}`;
  }

  function loadChartJs() {
    return new Promise((resolve, reject) => {
      if (window.Chart) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Chart.js failed'));
      document.head.appendChild(s);
    });
  }

  function rangeYears(firstYear, lastYear) {
    const years = [];
    for (let y = firstYear; y <= lastYear; y++) years.push(y);
    return years;
  }

  function makeTopList(heading, list) {
    const div = document.createElement('div');
    div.className = 'stat-tile';
    div.innerHTML = `<div class="tl" style="font-weight:700;font-size:.95rem;margin-bottom:.6rem;">${escapeHTML(heading)}</div>
      <ol class="entry-list">
        ${list.map(p => `<li><a href="${escapeHTML(p.url)}">${escapeHTML(entryLabel(p))}</a> <span>- ${p.words.toLocaleString()}w</span></li>`).join('')}
      </ol>`;
    return div;
  }

  try {
    progress('Loading Chart.js...', 10);
    await loadChartJs();

    progress('Fetching post index...', 30);
    const resp = await fetch('/post-index.json');
    if (!resp.ok) throw new Error('post-index.json not available');
    const rawDocs = await resp.json();

    progress('Processing archive...', 55);
    const entries = rawDocs.map(doc => {
      const url = doc.url || '';
      const date = doc.date ? new Date(doc.date + 'T12:00:00') : null;
      return {
        url,
        title: doc.title || '',
        excerpt: doc.excerpt || '',
        date,
        words: Number(doc.words || 0),
        images: Math.max(0, Number(doc.images || 1) - 1),
        isNote: !!doc.is_note
      };
    }).filter(entry => {
      if (!entry.date || isNaN(entry.date)) return false;
      const path = entry.url.replace(/^https?:\/\/[^/]+/, '');
      return !EXCLUDE.has(path);
    });

    if (!entries.length) throw new Error('No archive entries found in index');

    progress('Building summaries...', 72);

    const now = new Date();
    const curYear = now.getFullYear();
    const posts = entries.filter(e => !e.isNote);
    const notes = entries.filter(e => e.isNote);
    const byYear = new Map();
    const byYM = {};
    const byDecade = new Map();

    entries.forEach(entry => {
      const y = entry.date.getFullYear();
      const ys = String(y);
      const mo = String(entry.date.getMonth() + 1).padStart(2, '0');
      const decade = Math.floor(y / 10) * 10;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(entry);
      if (!byYM[ys]) byYM[ys] = {};
      if (!byYM[ys][mo]) byYM[ys][mo] = {entries:0, posts:0, notes:0, words:0};
      if (!byDecade.has(decade)) byDecade.set(decade, []);
      byDecade.get(decade).push(entry);

      byYM[ys][mo].entries++;
      byYM[ys][mo].words += entry.words;
      if (entry.isNote) byYM[ys][mo].notes++;
      else byYM[ys][mo].posts++;
    });

    const years = [...byYear.keys()].sort((a,b) => a - b);
    const firstYear = years[0];
    const lastYear = years[years.length - 1];
    const labels = rangeYears(firstYear, lastYear).map(String);
    const postCounts = labels.map(y => (byYear.get(Number(y)) || []).filter(e => !e.isNote).length);
    const noteCounts = labels.map(y => (byYear.get(Number(y)) || []).filter(e => e.isNote).length);
    const totalCounts = labels.map((_, i) => postCounts[i] + noteCounts[i]);

    const totalWords = entries.reduce((sum, e) => sum + e.words, 0);
    const postWords = posts.reduce((sum, e) => sum + e.words, 0);
    const noteWords = notes.reduce((sum, e) => sum + e.words, 0);
    const avgWords = entries.length ? Math.round(totalWords / entries.length) : 0;
    const avgPostWords = posts.length ? Math.round(postWords / posts.length) : 0;
    const avgNoteWords = notes.length ? Math.round(noteWords / notes.length) : 0;
    const nonZero = entries.filter(e => e.words > 0);
    const postNonZero = posts.filter(e => e.words > 0);
    const noteNonZero = notes.filter(e => e.words > 0);
    const longest = nonZero.length ? nonZero.reduce((a,b) => b.words > a.words ? b : a) : null;
    const longestPost = postNonZero.length ? postNonZero.reduce((a,b) => b.words > a.words ? b : a) : null;
    const firstEntry = entries.reduce((a,b) => a.date < b.date ? a : b);
    const maxCount = Math.max(...totalCounts);
    const minCount = Math.min(...totalCounts.filter(v => v > 0));
    const maxYear = labels[totalCounts.indexOf(maxCount)];
    const minYear = labels[totalCounts.indexOf(minCount)];
    const ytdEntries = byYear.get(curYear) || [];
    const avgPerYear = (lastYear - firstYear) > 0 ? (entries.length / (lastYear - firstYear + 1)).toFixed(1) : String(entries.length);
    const totalReadMins = Math.round(totalWords / WPM);
    const avgReadMins = avgWords ? Math.max(1, Math.round(avgWords / WPM)) : 0;
    const readDisplay = totalReadMins >= 60
      ? `${Math.floor(totalReadMins / 60)}h ${totalReadMins % 60}m`
      : `${totalReadMins}m`;

    new Chart(document.getElementById('stats-chart').getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Blog posts',
            data: postCounts,
            backgroundColor: 'rgba(74,144,226,.66)',
            borderColor: '#4a90e2',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Notes',
            data: noteCounts,
            backgroundColor: 'rgba(72,166,112,.66)',
            borderColor: '#48a670',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              footer: items => {
                const index = items[0].dataIndex;
                const total = postCounts[index] + noteCounts[index];
                return `Total: ${total} ${plural(total, 'entry', 'entries')}`;
              }
            }
          }
        },
        scales: {
          x: { stacked:true, title:{display:true,text:'Year'}, grid:{color:'rgba(128,128,128,.15)'} },
          y: { stacked:true, beginAtZero:true, title:{display:true,text:'Entries'}, grid:{color:'rgba(128,128,128,.15)'}, ticks:{precision:0} }
        }
      }
    });

    const sumEl = document.getElementById('summary');
    [
      tile('Total entries', entries.length.toLocaleString(), `${posts.length.toLocaleString()} posts + ${notes.length.toLocaleString()} notes`),
      tile('Years covered', `${firstYear}-${lastYear}`, `${lastYear - firstYear + 1} calendar years`),
      tile('Avg entries / year', avgPerYear),
      tile('Most active year', maxCount.toLocaleString(), maxYear),
      tile('Quietest active year', String(minCount), minYear),
      tile('This year (YTD)', ytdEntries.length.toLocaleString(), `${ytdEntries.filter(e => !e.isNote).length} posts + ${ytdEntries.filter(e => e.isNote).length} notes`),
      tile('Total words', totalWords.toLocaleString(), 'estimated from indexed text'),
      tile('Avg words / entry', String(avgWords)),
      tile('Total reading time', readDisplay, `~${avgReadMins} min avg per entry`),
      tile('Site uptime', fmtUptime(now - LAUNCH), 'since Cloudflare Pages launch')
    ].forEach(t => sumEl.appendChild(t));

    const mixEl = document.getElementById('entry-mix');
    const notePct = entries.length ? Math.round(notes.length * 100 / entries.length) : 0;
    const postPct = entries.length ? 100 - notePct : 0;
    [
      tile('Blog posts', posts.length.toLocaleString(), `${postPct}% of archive entries`),
      tile('Notes', notes.length.toLocaleString(), `${notePct}% of archive entries`),
      tile('Post words', postWords.toLocaleString(), `${avgPostWords} avg words/post`),
      tile('Note words', noteWords.toLocaleString(), `${avgNoteWords} avg words/note`)
    ].forEach(t => mixEl.appendChild(t));

    const decadeEl = document.getElementById('decades');
    [...byDecade.keys()].sort((a,b) => a - b).forEach(decade => {
      const decadeEntries = byDecade.get(decade) || [];
      const decadePosts = decadeEntries.filter(e => !e.isNote).length;
      const decadeNotes = decadeEntries.length - decadePosts;
      const decadeWords = decadeEntries.reduce((sum, e) => sum + e.words, 0);
      decadeEl.appendChild(tile(`${decade}s`, decadeEntries.length.toLocaleString(), `${decadePosts} posts + ${decadeNotes} notes · ${decadeWords.toLocaleString()} words`));
    });

    const cyPosts = ytdEntries.filter(e => !e.isNote);
    const cyNotes = ytdEntries.filter(e => e.isNote);
    if (ytdEntries.length) {
      const cyWords = ytdEntries.reduce((sum, e) => sum + e.words, 0);
      const cyLongest = ytdEntries.filter(e => e.words > 0).reduce((a,b) => b.words > a.words ? b : a, ytdEntries[0]);
      const recapEl = document.getElementById('year-recap');
      recapEl.style.display = 'block';
      recapEl.innerHTML = `
        <div style="font-weight:700;font-size:1rem;margin-bottom:.8rem;">${curYear} - Year in Progress</div>
        <div class="stats-grid" style="margin-bottom:.65rem;">
          <div><span style="font-size:1.5rem;font-weight:700;">${ytdEntries.length.toLocaleString()}</span> <span style="color:#666;font-size:.85rem;">Entries</span></div>
          <div><span style="font-size:1.5rem;font-weight:700;">${cyPosts.length.toLocaleString()}</span> <span style="color:#666;font-size:.85rem;">Posts</span></div>
          <div><span style="font-size:1.5rem;font-weight:700;">${cyNotes.length.toLocaleString()}</span> <span style="color:#666;font-size:.85rem;">Notes</span></div>
          <div><span style="font-size:1.5rem;font-weight:700;">${cyWords.toLocaleString()}</span> <span style="color:#666;font-size:.85rem;">Words</span></div>
        </div>
        ${cyLongest ? `<p style="margin:.25rem 0 0;font-size:.88rem;color:#555;">Longest this year: <a href="${escapeHTML(cyLongest.url)}">${escapeHTML(entryLabel(cyLongest))}</a> - ${cyLongest.words.toLocaleString()} words</p>` : ''}`;
    }

    const imgEl = document.getElementById('image-stats');
    const withImages = entries.filter(e => e.images > 0);
    const imageNotes = notes.filter(e => e.images > 0);
    const imageOnly = entries.filter(e => e.images > 0 && e.words < 75);
    const totalImages = entries.reduce((sum, e) => sum + e.images, 0);
    const imgPct = entries.length ? Math.round(withImages.length * 100 / entries.length) : 0;
    imgEl.style.display = 'grid';
    [
      tile('Entries with images', withImages.length.toLocaleString(), `${imgPct}% of archive entries`),
      tile('Image notes', imageNotes.length.toLocaleString(), 'notes with at least one image'),
      tile('Image-only entries', imageOnly.length.toLocaleString(), 'image present, under 75 words'),
      tile('Total images indexed', totalImages.toLocaleString(), 'across posts and notes')
    ].forEach(t => imgEl.appendChild(t));

    const pickerEl = document.getElementById('year-picker');
    const pickWrap = document.getElementById('picker-wrap');
    const yearSumEl = document.getElementById('year-summary');
    const moGrid = document.getElementById('monthly-grid');

    function renderYear(y) {
      const yp = byYear.get(parseInt(y, 10)) || [];
      const yPosts = yp.filter(e => !e.isNote);
      const yNotes = yp.filter(e => e.isNote);
      const yWords = yp.reduce((sum, e) => sum + e.words, 0);
      const yAvg = yp.length ? Math.round(yWords / yp.length) : 0;
      yearSumEl.innerHTML = `<strong>${escapeHTML(y)}:</strong> ${yp.length} ${plural(yp.length, 'entry', 'entries')} · ${yPosts.length} posts · ${yNotes.length} notes · ${yWords.toLocaleString()} words · ${yAvg} avg words/entry`;
      moGrid.style.display = 'grid';
      moGrid.innerHTML = '';
      for (let i = 0; i < 12; i++) {
        const mo = String(i + 1).padStart(2, '0');
        const d = (byYM[y] || {})[mo] || {entries:0, posts:0, notes:0, words:0};
        const sub = d.entries
          ? `${d.posts} posts · ${d.notes} notes${d.words ? ' · ' + d.words.toLocaleString() + ' w' : ''}`
          : 'No entries';
        moGrid.appendChild(tile(`${MO_NAMES[i]} ${y}`, String(d.entries), sub));
      }
    }

    [...years].reverse().forEach(y => {
      const option = document.createElement('option');
      option.value = option.textContent = y;
      pickerEl.appendChild(option);
    });
    pickerEl.onchange = () => renderYear(pickerEl.value);
    pickWrap.style.display = 'block';
    renderYear(String(lastYear));

    const topEl = document.getElementById('top-posts');
    topEl.style.display = 'grid';
    if (postNonZero.length) {
      topEl.appendChild(makeTopList('Top 5 Longest Blog Posts', [...postNonZero].sort((a,b) => b.words - a.words).slice(0, 5)));
    }
    if (noteNonZero.length) {
      topEl.appendChild(makeTopList('Top 5 Longest Notes', [...noteNonZero].sort((a,b) => b.words - a.words).slice(0, 5)));
    }
    topEl.appendChild(makeTopList('Top 5 Shortest Entries', [...nonZero].sort((a,b) => a.words - b.words).slice(0, 5)));

    const msEl = document.getElementById('milestones');
    msEl.style.display = 'grid';
    msEl.appendChild(tile('First indexed entry', entryLabel(firstEntry), fmtDate(firstEntry.date), firstEntry.url));
    if (longest) msEl.appendChild(tile('Longest entry', entryLabel(longest), `${longest.words.toLocaleString()} words`, longest.url));
    if (longestPost) msEl.appendChild(tile('Longest blog post', entryLabel(longestPost), `${longestPost.words.toLocaleString()} words`, longestPost.url));

    const rdEl = document.getElementById('reading');
    rdEl.style.display = 'grid';
    rdEl.appendChild(tile('Total reading time', readDisplay));
    rdEl.appendChild(tile('Avg per entry', `~${avgReadMins} min`));
    if (longest) rdEl.appendChild(tile('Longest entry read', `~${Math.max(1, Math.round(longest.words / WPM))} min`));

    const streaks = calcStreaks(entries.map(e => e.date));
    const postStreaks = calcStreaks(posts.map(e => e.date));
    const stEl = document.getElementById('streaks');
    stEl.style.display = 'grid';
    stEl.appendChild(tile('Current entry streak', `${streaks.cur} ${plural(streaks.cur, 'day')}`, fmtStreak(streaks.cS, streaks.cE)));
    stEl.appendChild(tile('Longest entry streak', `${streaks.max} ${plural(streaks.max, 'day')}`, fmtStreak(streaks.mS, streaks.mE)));
    stEl.appendChild(tile('Longest post-only streak', `${postStreaks.max} ${plural(postStreaks.max, 'day')}`, fmtStreak(postStreaks.mS, postStreaks.mE)));

    document.getElementById('stats-foot').textContent =
      `${entries.length.toLocaleString()} entries (${posts.length.toLocaleString()} posts + ${notes.length.toLocaleString()} notes) · ${firstYear}-${lastYear} · Powered by Zola post-index.json · Word counts and reading time are estimates from indexed plain text`;

    progress('Done!', 100);
    setTimeout(() => { loaderEl.style.display = 'none'; }, 600);

  } catch (err) {
    loaderEl.innerHTML = `<p style="color:#c00;padding:.5rem;">Could not load stats: ${escapeHTML(err.message)}</p>`;
    console.error('Stats error:', err);
  }
})();
</script>

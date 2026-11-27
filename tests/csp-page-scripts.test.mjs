// JOURNAL-CSP-01 Phase 3 step 3: the page templates (archive, gallery, slideshow, notes,
// pagination, post share, search and the TownSquare page) carry no inline code. Their
// scripts live in static/js/page-*.js (TownSquare reuses site-townsquare-footer.js), load
// where the inline code ran, and keep the same behaviour. The Listening covers no longer
// carry an inline onerror.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { scanPage } from '../tools/csp-inline-inventory.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

// template -> the file it loads
const PAGES = {
  'templates/archive.html': '/js/page-archive.js',
  'templates/gallery/single.html': '/js/page-gallery-single.js',
  'templates/gallery-slideshow.html': '/js/page-gallery-slideshow.js',
  'themes/ergo/templates/notes.html': '/js/page-notes.js',
  'themes/ergo/templates/partials/pagination.html': '/js/page-pagination.js',
  'themes/ergo/templates/partials/post-share.html': '/js/page-post-share.js',
  'templates/search.html': '/js/page-search.js',
  'templates/townsquare.html': '/js/site-townsquare-footer.js',
  // Phase 3 step 4.
  'themes/ergo/templates/partials/webmentions.html': '/js/page-webmentions.js',
};

test('step 3: the page templates have no inline script, no on* handler, no script body beside src', () => {
  for (const file of Object.keys(PAGES)) {
    const html = read(file).replace(/\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g, '');
    assert.deepEqual(scanPage(html), [], `${file}: inline code`);
    assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i, `${file}: on* attribute`);
    assert.doesNotMatch(html, /data-csp-id/, `${file}: inventory tag left behind`);
    for (const m of html.matchAll(SCRIPT_TAG)) {
      if (/\bsrc\s*=/i.test(m[1])) assert.equal(m[2].trim(), '', `${file}: body beside src`);
    }
  }
});

test('step 3: each page script loads once, after the markup it uses and before the block ends', () => {
  const order = (file, ...needles) => {
    const text = read(file);
    let at = -1;
    for (const needle of needles) {
      const i = text.indexOf(needle, at + 1);
      assert.ok(i > at, `${file}: ${needle} out of order or missing`);
      at = i;
    }
  };
  const tag = (file) => `<script src="${PAGES[file]}"></script>`;
  for (const file of Object.keys(PAGES)) {
    const src = PAGES[file];
    assert.equal(read(file).split(`src="${src}"`).length - 1, 1, `${file}: loads ${src} once`);
  }
  order('templates/archive.html', 'id="year-select"', 'class="archive-year', tag('templates/archive.html'), '{% endblock content %}');
  // GLightbox first (vendored, SRI), then the starter.
  order('templates/gallery/single.html', 'glightbox.min.js" integrity="sha384-', tag('templates/gallery/single.html'), '{% endblock content %}');
  order('templates/gallery-slideshow.html', 'id="carousel"', 'id="carousel-playpause"', 'id="carousel-photos"', tag('templates/gallery-slideshow.html'), '{% endblock content %}');
  order('themes/ergo/templates/notes.html', 'data-sticky-toggle', tag('themes/ergo/templates/notes.html'), '{% endblock content %}');
  // Inside the "more than one page" condition, after the pager it binds.
  order('themes/ergo/templates/partials/pagination.html', '{% if paginator.number_pagers > 1 %}', '</nav>', tag('themes/ergo/templates/partials/pagination.html'), '{% endif %}');
  order('themes/ergo/templates/partials/post-share.html', '{% if not page.extra.no_kudos %}', 'id="iw-post-listens"', tag('themes/ergo/templates/partials/post-share.html'), '{% endif %}');
  order('templates/search.html', 'id="search-input"', 'id="search-results"', '<script src="/elasticlunr.min.js"></script>', tag('templates/search.html'), '{% endblock content %}');
});

test('step 3: the TownSquare page passes the same data attributes as the footer and loads the module', () => {
  const page = read('templates/townsquare.html');
  const attrs = (html) => {
    const m = html.match(/<div id="townsquare-root"([^>]*)><\/div>/);
    assert.ok(m, 'townsquare-root');
    return m[1];
  };
  assert.equal(attrs(page), attrs(read('themes/ergo/templates/base.html')));
  const ifAt = page.indexOf('{% if config.extra.townsquare.enabled %}');
  const mod = page.indexOf('<script type="module" src="/js/site-townsquare-footer.js"></script>');
  const elseAt = page.indexOf('{% else %}', ifAt);
  assert.ok(ifAt !== -1 && ifAt < page.indexOf('id="townsquare-root"') && page.indexOf('id="townsquare-root"') < mod && mod < elseAt);
  // The page has no footer widget, so there is never a second #townsquare-root.
  assert.match(read('content/townsquare.md'), /^no_footer_townsquare = true$/m);
});

test('step 3: every page-*.js is loaded by exactly one template, none is orphaned, and each parses', () => {
  const present = fs.readdirSync(path.join(root, 'static/js')).filter((f) => /^page-.*\.js$/.test(f)).sort();
  const referenced = Object.values(PAGES).filter((s) => s.startsWith('/js/page-')).map((s) => s.slice(4)).sort();
  assert.deepEqual(present, referenced);
  assert.equal(present.length, 8); // 7 from step 3, page-webmentions.js from step 4
  for (const f of present) {
    const text = read(`static/js/${f}`);
    assert.doesNotThrow(() => new vm.Script(text, { filename: f }), f);
    assert.doesNotMatch(text, /\bon[a-z]+\s*=\s*["']/i, `${f}: builds an inline handler`);
  }
});

// --- behaviour checks with tiny DOM stand-ins ---

function listenerTarget(extra = {}) {
  const listeners = [];
  return {
    listeners,
    addEventListener(type, fn, capture) { listeners.push({ type, fn, capture: Boolean(capture) }); },
    ...extra,
  };
}

test('step 3: the Listening card removes a broken cover through a capturing error listener', async () => {
  const listen = (name, caa) => ({
    listened_at: Math.floor(Date.now() / 1000) - 120,
    track_metadata: { track_name: name, artist_name: 'Artist', mbid_mapping: caa },
  });
  const box = listenerTarget({ innerHTML: '' });
  const replies = {
    'playing-now': { payload: { listens: [] } },
    'listens?count=5': { payload: { listens: [listen('One', { caa_release_mbid: '0f2e1c3a-1111-2222-3333-444455556666', caa_id: 42 }), listen('Two', {})] } },
  };
  const context = {
    navigator: {},
    window: {},
    setTimeout,
    fetch: (url) => Promise.resolve({ ok: true, json: () => replies[url.split('/MLM361/')[1]] }),
    document: {
      querySelector: () => null,
      getElementById: (id) => (id === 'iw-post-listens' ? box : null),
      createElement: () => {
        let text = '';
        return {
          set textContent(v) { text = v; },
          get innerHTML() { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
        };
      },
    },
  };
  vm.runInNewContext(read('static/js/page-post-share.js'), context);
  const errors = box.listeners.filter((l) => l.type === 'error');
  assert.equal(errors.length, 1, 'one error listener on the box');
  assert.equal(errors[0].capture, true, 'capture phase: error events do not bubble');
  await new Promise((r) => setTimeout(r, 0));
  assert.match(box.innerHTML, /<img class="iw-cover" src="https:\/\/coverartarchive\.org\/release\/0f2e1c3a-1111-2222-3333-444455556666\/42-250\.jpg" alt="" loading="lazy">/);
  assert.doesNotMatch(box.innerHTML, /onerror/i);
  assert.equal(box.innerHTML.split('class="iw-listen"').length - 1, 2);

  const removed = [];
  const img = (cls) => ({ tagName: 'IMG', classList: { contains: (c) => c === cls }, remove() { removed.push(cls); } });
  errors[0].fn({ target: img('iw-cover') });
  errors[0].fn({ target: img('something-else') });
  errors[0].fn({ target: { tagName: 'SCRIPT', classList: { contains: () => true }, remove() { removed.push('script'); } } });
  assert.deepEqual(removed, ['iw-cover']);
});

test('step 3: the pager input goes to the typed page, clamps, and resets on bad input', () => {
  function run(current, total, typed) {
    const input = listenerTarget({ value: String(current), select() {}, blur() {} });
    const pager = {
      querySelector: (sel) => (sel === '.pager-input' ? input : null),
      getAttribute: (name) => ({ 'data-current-page': String(current), 'data-total-pages': String(total) })[name],
    };
    const context = { window: { location: { href: '' } }, document: { querySelectorAll: () => [pager] }, Number };
    vm.runInNewContext(read('static/js/page-pagination.js'), context);
    input.value = typed;
    let prevented = false;
    for (const l of input.listeners.filter((x) => x.type === 'keydown')) l.fn({ key: 'Enter', preventDefault() { prevented = true; } });
    assert.ok(prevented);
    return { href: context.window.location.href, value: input.value };
  }
  assert.equal(run(1, 9, '3').href, '/page/3/');
  assert.equal(run(4, 9, '1').href, '/');
  assert.equal(run(1, 9, '99').href, '/page/9/');
  assert.deepEqual(run(2, 9, 'x'), { href: '', value: '2' });
  assert.deepEqual(run(2, 9, '2'), { href: '', value: '2' });
});

test('step 3: notes Expand/Collapse toggles the note and the button label', () => {
  const set = new Set();
  const note = { classList: { toggle(c) { if (set.has(c)) { set.delete(c); return false; } set.add(c); return true; } } };
  const attrs = {};
  const btn = listenerTarget({ textContent: 'Expand', closest: () => note, setAttribute: (k, v) => { attrs[k] = v; } });
  vm.runInNewContext(read('static/js/page-notes.js'), { document: { querySelectorAll: () => [btn] } });
  const click = btn.listeners.find((l) => l.type === 'click').fn;
  click();
  assert.deepEqual([btn.textContent, attrs['aria-expanded'], set.has('is-expanded')], ['Collapse', 'true', true]);
  click();
  assert.deepEqual([btn.textContent, attrs['aria-expanded'], set.has('is-expanded')], ['Expand', 'false', false]);
});

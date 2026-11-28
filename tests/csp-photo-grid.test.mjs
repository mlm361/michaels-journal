// JOURNAL-CSP-01 Phase 3 step 5a: the Photo Grid lightbox lives in static/js/photo-grid.js and
// binds Blog Poster's new data-pg-* markup. Tiles and controls that still carry the old inline
// onclick (posts published before step 6) are skipped, so each one is bound exactly once.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { scanPage } from '../tools/csp-inline-inventory.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const SCRIPT = read('static/js/photo-grid.js');

test('step 5a: base.html loads photo-grid.js once, deferred, only where the content has data-pg-open', () => {
  const base = read('themes/ergo/templates/base.html');
  const tags = base.match(/<script[^>]*photo-grid\.js[^>]*><\/script>/g) || [];
  assert.equal(tags.length, 1);
  assert.match(tags[0], /^<script src="\/js\/photo-grid\.js" defer><\/script>$/);
  const block = /\{%-? if page is defined and "data-pg-open" in page\.content %\}([\s\S]*?)\{%-? endif %\}/.exec(base);
  assert.ok(block, 'conditional block');
  assert.ok(block[1].includes(tags[0]), 'the tag sits inside the condition');
});

test('step 5a: photo-grid.js parses and never builds inline code', () => {
  assert.doesNotThrow(() => new vm.Script(SCRIPT, { filename: 'photo-grid.js' }));
  const code = SCRIPT.replace(/^\s*\/\/.*$/gm, ''); // the header comment quotes the legacy markup
  assert.ok(code.length > 1000 && code.includes('bindOnce'), 'comment stripping kept the code');
  assert.doesNotMatch(code, /\bon[a-z]+\s*=\s*["']/i, 'builds an inline handler');
  assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  assert.match(SCRIPT, /setAttribute\('data-pg-bound', '1'\)/);
});

// --- a tiny DOM stand-in ---

function el(attrs = {}) {
  const a = { ...attrs };
  const listeners = [];
  return {
    listeners,
    style: { display: 'none' },
    src: '',
    alt: '',
    textContent: '',
    children: [],
    hasAttribute: (k) => Object.prototype.hasOwnProperty.call(a, k),
    getAttribute: (k) => (Object.prototype.hasOwnProperty.call(a, k) ? a[k] : null),
    setAttribute: (k, v) => { a[k] = String(v); },
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    querySelectorAll(sel) {
      const key = /^\[([a-z-]+)\]$/.exec(sel)[1];
      return this.children.filter((c) => c.hasAttribute(key));
    },
  };
}

function page({ tiles, box, legacyGlobal = false }) {
  const img = el({ id: 'pgLbImg', ...(box.legacy ? { onclick: 'event.stopPropagation()' } : { 'data-pg-stop': '' }) });
  const cap = el({ id: 'pgLbCap' });
  const button = el(box.legacy ? { onclick: 'pgLbClose();event.stopPropagation();' } : { 'data-pg-close': '' });
  const lightbox = el(box.legacy ? { id: 'pgLb', onclick: 'pgLbClose()' } : { id: 'pgLb', 'data-pg-lightbox': '' });
  lightbox.children = [img, cap, button];
  const html = el();
  const docListeners = [];
  const document = {
    readyState: 'complete',
    baseURI: 'https://michaelreflects.com/blog/a-post/',
    documentElement: html,
    getElementById: (id) => ({ pgLb: lightbox, pgLbImg: img, pgLbCap: cap })[id] || null,
    querySelectorAll: (sel) => {
      assert.equal(sel, 'a[data-pg-open]');
      return tiles.filter((t) => t.hasAttribute('data-pg-open'));
    },
    addEventListener: (type, fn) => docListeners.push({ type, fn }),
  };
  const window = legacyGlobal ? { pgLbClose() {} } : {};
  return { document, window, lightbox, img, cap, button, docListeners, URL };
}

const newTile = (href = 'https://media.mitchelltribe.xyz/gallery/x/full-1.avif') =>
  el({ href, 'data-pg-open': '', 'data-alt': 'Alt text', 'data-caption': 'A caption' });
const legacyTile = () =>
  el({ href: 'https://media.mitchelltribe.xyz/gallery/x/full-2.avif', onclick: 'pgLbOpen(this);return false;', 'data-alt': 'Old', 'data-caption': 'Old' });

const event = () => {
  const e = { prevented: false, stopped: false };
  e.preventDefault = () => { e.prevented = true; };
  e.stopPropagation = () => { e.stopped = true; };
  return e;
};
const clicks = (node) => node.listeners.filter((l) => l.type === 'click');

test('step 5a: new markup: a click opens one lightbox; backdrop, button and Escape close it; the image stops the click', () => {
  const t1 = newTile();
  const t2 = newTile('https://media.mitchelltribe.xyz/gallery/x/full-3.avif');
  const p = page({ tiles: [t1, t2], box: { legacy: false } });
  vm.runInNewContext(SCRIPT, p);

  assert.equal(clicks(t1).length, 1);
  assert.equal(clicks(t2).length, 1);
  const e = event();
  clicks(t1)[0].fn(e);
  assert.equal(e.prevented, true);
  assert.deepEqual([p.lightbox.style.display, p.img.src, p.img.alt, p.cap.textContent],
    ['flex', 'https://media.mitchelltribe.xyz/gallery/x/full-1.avif', 'Alt text', 'A caption']);

  const onImage = event();
  assert.equal(clicks(p.img).length, 1);
  clicks(p.img)[0].fn(onImage);
  assert.equal(onImage.stopped, true);
  assert.equal(p.lightbox.style.display, 'flex', 'clicking the image keeps it open');

  assert.equal(clicks(p.lightbox).length, 1);
  clicks(p.lightbox)[0].fn(event());
  assert.equal(p.lightbox.style.display, 'none');

  clicks(t2)[0].fn(event());
  assert.equal(p.img.src, 'https://media.mitchelltribe.xyz/gallery/x/full-3.avif');
  const onButton = event();
  assert.equal(clicks(p.button).length, 1);
  clicks(p.button)[0].fn(onButton);
  assert.equal(onButton.stopped, true);
  assert.equal(p.lightbox.style.display, 'none');

  const keys = p.docListeners.filter((l) => l.type === 'keydown');
  assert.equal(keys.length, 1);
  clicks(t1)[0].fn(event());
  keys[0].fn({ key: 'Enter' });
  assert.equal(p.lightbox.style.display, 'flex');
  keys[0].fn({ key: 'Escape' });
  assert.equal(p.lightbox.style.display, 'none');
});

test('step 5a: legacy markup keeps its own onclick and is not bound again', () => {
  const t = legacyTile();
  const p = page({ tiles: [t], box: { legacy: true }, legacyGlobal: true });
  vm.runInNewContext(SCRIPT, p);
  for (const node of [t, p.lightbox, p.img, p.button]) assert.equal(clicks(node).length, 0);
  assert.equal(p.docListeners.filter((l) => l.type === 'keydown').length, 0, 'the old script owns Escape');
});

test('step 5a: a page with both kinds binds only the new tiles, once, and the old script keeps Escape', () => {
  const fresh = newTile();
  const old = legacyTile();
  const p = page({ tiles: [old, fresh], box: { legacy: true }, legacyGlobal: true });
  vm.runInNewContext(SCRIPT, p);
  assert.equal(clicks(fresh).length, 1);
  assert.equal(clicks(old).length, 0);
  clicks(fresh)[0].fn(event());
  assert.equal(p.lightbox.style.display, 'flex', 'a new tile opens the (old) lightbox on the page');
  for (const node of [p.lightbox, p.img, p.button]) assert.equal(clicks(node).length, 0, 'old controls keep their onclick');
  assert.equal(p.docListeners.filter((l) => l.type === 'keydown').length, 0);
});

test('step 5a: loading the file twice binds nothing twice', () => {
  const t = newTile();
  const p = page({ tiles: [t], box: { legacy: false } });
  vm.runInNewContext(SCRIPT, p);
  vm.runInNewContext(SCRIPT, p);
  for (const node of [t, p.lightbox, p.img, p.button]) assert.equal(clicks(node).length, 1);
  assert.equal(p.docListeners.filter((l) => l.type === 'keydown').length, 1);
});

test('step 5a: a non-http link is not opened in the lightbox and keeps its default', () => {
  const t = newTile('javascript:alert(1)');
  const p = page({ tiles: [t], box: { legacy: false } });
  vm.runInNewContext(SCRIPT, p);
  const e = event();
  clicks(t)[0].fn(e);
  assert.equal(e.prevented, false);
  assert.equal(p.lightbox.style.display, 'none');
  assert.equal(p.img.src, '');
});

test('step 5a: the scanner finds no inline code in the new Photo Grid markup', () => {
  const html = '<div><a href="https://media.mitchelltribe.xyz/f.avif" data-pg-open data-alt="a" data-caption="c"><img src="https://media.mitchelltribe.xyz/t.avif" alt="a"></a></div>' +
    '<div id="pgLb" data-pg-lightbox style="display:none"><img id="pgLbImg" data-pg-stop src="" alt=""><p id="pgLbCap"></p><button type="button" data-pg-close aria-label="Close">&#x2715;</button></div>';
  assert.deepEqual(scanPage(html), []);
});

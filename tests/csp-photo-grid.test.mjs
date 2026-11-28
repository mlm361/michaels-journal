// JOURNAL-CSP-01 Phase 3 step 5a: the Photo Grid lightbox lives in static/js/photo-grid.js and
// binds Blog Poster's new markup: each [data-pg-grid] carries its own [data-pg-lightbox], with no
// ids, no <script> and no on* handlers. The old markup (ids pgLb/pgLbImg/pgLbCap, inline handlers
// and script) is left entirely to itself, so a page mixing both kinds, in either order, opens the
// right box for every tile.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { scanPage } from '../tools/csp-inline-inventory.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const SCRIPT = read('static/js/photo-grid.js');
const CODE = SCRIPT.replace(/^\s*\/\/.*$/gm, ''); // the header comment quotes the markup

test('step 5a: base.html loads photo-grid.js once, deferred, only where the content has data-pg-open', () => {
  const base = read('themes/ergo/templates/base.html');
  const tags = base.match(/<script[^>]*photo-grid\.js[^>]*><\/script>/g) || [];
  assert.equal(tags.length, 1);
  assert.match(tags[0], /^<script src="\/js\/photo-grid\.js" defer><\/script>$/);
  const block = /\{%-? if page is defined and "data-pg-open" in page\.content %\}([\s\S]*?)\{%-? endif %\}/.exec(base);
  assert.ok(block, 'conditional block');
  assert.ok(block[1].includes(tags[0]), 'the tag sits inside the condition');
});

test('step 5a: photo-grid.js parses, builds no inline code and never touches the legacy ids', () => {
  assert.doesNotThrow(() => new vm.Script(SCRIPT, { filename: 'photo-grid.js' }));
  assert.ok(CODE.length > 1000 && CODE.includes('bindOnce'), 'comment stripping kept the code');
  assert.doesNotMatch(CODE, /\bon[a-z]+\s*=\s*["']/i, 'builds an inline handler');
  assert.doesNotMatch(CODE, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  assert.doesNotMatch(CODE, /getElementById|pgLb/, 'looks up the legacy ids');
});

// --- a tiny DOM stand-in: tags, attributes, parent links, descendant selectors of [attr] parts ---

function node(tag, attrs = {}, children = []) {
  const a = { ...attrs };
  const n = {
    tag, parent: null, children, listeners: [], style: { display: a.style || '' }, src: '', alt: '', textContent: '',
    hasAttribute: (k) => Object.prototype.hasOwnProperty.call(a, k),
    getAttribute: (k) => (Object.prototype.hasOwnProperty.call(a, k) ? a[k] : null),
    setAttribute: (k, v) => { a[k] = String(v); },
    addEventListener(type, fn) { n.listeners.push({ type, fn }); },
    closest(sel) { for (let p = n; p; p = p.parent) if (matches(p, sel)) return p; return null; },
    querySelector(sel) { return n.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) { return all(n).filter((d) => d !== n && matchesPath(d, sel.split(' '), n)); },
  };
  for (const c of children) c.parent = n;
  return n;
}
function all(n) { return [n, ...n.children.flatMap(all)]; }
function matches(n, simple) {
  const m = /^([a-z]*)((?:\[[a-z-]+\])*)$/.exec(simple);
  if (!m) throw new Error(`unsupported selector ${simple}`);
  if (m[1] && n.tag !== m[1]) return false;
  return [...m[2].matchAll(/\[([a-z-]+)\]/g)].every(([, k]) => n.hasAttribute(k));
}
function matchesPath(n, parts, scope) {
  if (!matches(n, parts[parts.length - 1])) return false;
  let rest = parts.slice(0, -1);
  for (let p = n.parent; rest.length && p && p !== scope.parent; p = p.parent) if (matches(p, rest[rest.length - 1])) rest = rest.slice(0, -1);
  return rest.length === 0;
}

const IMG = (name) => `https://media.mitchelltribe.xyz/gallery/x/${name}.avif`;
function newGrid(label, names) {
  const tiles = names.map((nm) => node('a', { href: IMG(nm), 'data-pg-open': '', 'data-alt': `${nm} alt`, 'data-caption': `${nm} caption` }));
  const img = node('img', { 'data-pg-img': '' });
  const cap = node('p', { 'data-pg-cap': '' });
  const button = node('button', { 'data-pg-close': '' });
  const box = node('div', { 'data-pg-lightbox': '', style: 'none' }, [img, cap, button]);
  const grid = node('div', { 'data-pg-grid': '', label }, [node('div', {}, tiles), box]);
  return { grid, tiles, box, img, cap, button };
}
function legacyGrid() {
  const tiles = ['old1', 'old2'].map((nm) => node('a', { href: IMG(nm), onclick: 'pgLbOpen(this);return false;', 'data-alt': nm, 'data-caption': nm }));
  const img = node('img', { id: 'pgLbImg', onclick: 'event.stopPropagation()' });
  const cap = node('p', { id: 'pgLbCap' });
  const button = node('button', { onclick: 'pgLbClose();event.stopPropagation();' });
  const box = node('div', { id: 'pgLb', onclick: 'pgLbClose()', style: 'none' }, [img, cap, button]);
  const wrap = node('div', {}, [node('div', {}, [node('div', {}, tiles)]), box]);
  return { grid: wrap, tiles, box, img, cap, button };
}
function page(...blocks) {
  const html = node('html', {}, [node('body', {}, blocks.map((b) => b.grid))]);
  const docListeners = [];
  const document = {
    readyState: 'complete',
    baseURI: 'https://michaelreflects.com/blog/a-post/',
    documentElement: html,
    querySelectorAll: (sel) => html.querySelectorAll(sel),
    addEventListener: (type, fn) => docListeners.push({ type, fn }),
  };
  const context = { document, window: {}, URL };
  return { context, docListeners, run: () => vm.runInNewContext(SCRIPT, context) };
}
const ev = () => {
  const e = { prevented: false, stopped: false };
  e.preventDefault = () => { e.prevented = true; };
  e.stopPropagation = () => { e.stopped = true; };
  return e;
};
const clicks = (n) => n.listeners.filter((l) => l.type === 'click');
const click = (n) => { const e = ev(); assert.equal(clicks(n).length, 1, 'bound exactly once'); clicks(n)[0].fn(e); return e; };
const shown = (b) => b.box.style.display === 'flex';

function exerciseNew(p, a, others) {
  // Each tile opens its own grid's box with its own image and caption; other boxes stay closed.
  for (const [i, tile] of a.tiles.entries()) {
    const e = click(tile);
    assert.equal(e.prevented, true);
    assert.ok(shown(a), 'own box opens');
    for (const o of others) assert.ok(!shown(o), 'no other box opens');
    const nm = tile.getAttribute('href').split('/').pop().replace('.avif', '');
    assert.deepEqual([a.img.src, a.img.alt, a.cap.textContent], [IMG(nm), `${nm} alt`, `${nm} caption`], `tile ${i} content`);
    assert.equal(click(a.img).stopped, true, 'image click stops');
    assert.ok(shown(a), 'image click keeps it open');
    click(a.box);
    assert.ok(!shown(a), 'backdrop closes');
  }
  click(a.tiles[0]);
  assert.equal(click(a.button).stopped, true);
  assert.ok(!shown(a), 'button closes');
  click(a.tiles[0]);
  const keys = p.docListeners.filter((l) => l.type === 'keydown');
  assert.equal(keys.length, 1, 'one Escape listener');
  keys[0].fn({ key: 'Enter' });
  assert.ok(shown(a), 'other keys do nothing');
  keys[0].fn({ key: 'Escape' });
  assert.ok(!shown(a), 'Escape closes');
}
function assertLegacyUntouched(old) {
  for (const n of [...old.tiles, old.box, old.img, old.button]) {
    assert.equal(clicks(n).length, 0, 'legacy element not bound');
    assert.equal(n.getAttribute('data-pg-bound'), null);
  }
  assert.ok(!shown(old) && old.img.src === '' && old.cap.textContent === '', 'legacy box untouched');
}

test('step 5a: new only: two grids, each tile opens its own box with its own image and caption', () => {
  const a = newGrid('A', ['a1', 'a2']);
  const b = newGrid('B', ['b1']);
  const p = page(a, b);
  p.run();
  exerciseNew(p, a, [b]);
  exerciseNew(p, b, [a]);
});

test('step 5a: legacy only: nothing is bound and no Escape listener is added', () => {
  const old = legacyGrid();
  const p = page(old);
  p.run();
  assertLegacyUntouched(old);
  assert.equal(p.docListeners.length, 0);
});

for (const order of ['legacy first', 'new first']) {
  test(`step 5a: mixed page, ${order}: new tiles open the new box; legacy markup is left alone`, () => {
    const old = legacyGrid();
    const a = newGrid('A', ['a1', 'a2']);
    const p = page(...(order === 'legacy first' ? [old, a] : [a, old]));
    p.run();
    exerciseNew(p, a, [old]);
    assertLegacyUntouched(old);
    // The legacy box's own state is not changed by the new Escape listener.
    old.box.style.display = 'flex';
    click(a.tiles[1]);
    p.docListeners.find((l) => l.type === 'keydown').fn({ key: 'Escape' });
    assert.ok(!shown(a));
    assert.equal(old.box.style.display, 'flex', 'legacy box is closed only by its own script');
  });
}

test('step 5a: a second initialization binds nothing twice', () => {
  const a = newGrid('A', ['a1']);
  const old = legacyGrid();
  const p = page(old, a);
  p.run();
  p.run();
  for (const n of [...a.tiles, a.box, a.img, a.button]) assert.equal(clicks(n).length, 1);
  assert.equal(p.docListeners.filter((l) => l.type === 'keydown').length, 1);
  assertLegacyUntouched(old);
  exerciseNew(p, a, [old]);
});

test('step 5a: a non-http link, or a tile outside any grid, keeps its default and opens nothing', () => {
  const a = newGrid('A', ['a1']);
  a.tiles[0].setAttribute('href', 'javascript:alert(1)');
  const stray = node('a', { href: IMG('s'), 'data-pg-open': '' });
  const p = page(a, { grid: node('div', {}, [stray]) });
  p.run();
  assert.equal(click(a.tiles[0]).prevented, false);
  assert.ok(!shown(a));
  assert.equal(a.img.src, '');
  assert.equal(clicks(stray).length, 0, 'a tile outside [data-pg-grid] is not bound');
});

test('step 5a: the scanner finds no inline code in the new Photo Grid markup', () => {
  const html = '<div data-pg-grid style="margin:24px 0;"><div style="display:grid"><div><a href="https://media.mitchelltribe.xyz/f.avif" data-pg-open data-alt="a" data-caption="c"><img src="https://media.mitchelltribe.xyz/t.avif" alt="a"></a></div></div>' +
    '<div data-pg-lightbox style="display:none"><img data-pg-img src="" alt=""><p data-pg-cap></p><button type="button" data-pg-close aria-label="Close">&#x2715;</button></div></div>';
  assert.deepEqual(scanPage(html), []);
});

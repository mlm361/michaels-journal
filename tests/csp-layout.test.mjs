// JOURNAL-CSP-01 Phase 3 step 2: the layout (base.html and both menu templates) carries no
// inline code. Its scripts live in static/js/site-*.js, load where the inline code ran, and
// keep the same behaviour. Reply pages use the same files and nothing binds the menu twice.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

import { scanPage } from '../tools/csp-inline-inventory.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const BASE = 'themes/ergo/templates/base.html';
const MENUS = ['templates/menu.html', 'themes/ergo/templates/menu.html'];
const LAYOUT = [BASE, ...MENUS];
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

test('step 2: base.html and both menus have no inline script, no on* handler, no script body beside src', () => {
  for (const file of LAYOUT) {
    // Tera tags and comments are build-time only (base.html's description filter holds a
    // literal "<script[ >].*?</script>" pattern), so scan the markup without them.
    const html = read(file).replace(/\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g, '');
    assert.deepEqual(scanPage(html), [], `${file}: inline code`);
    assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i, `${file}: on* attribute`);
    assert.doesNotMatch(html, /data-csp-id/, `${file}: inventory tag left behind`);
    for (const m of html.matchAll(SCRIPT_TAG)) {
      if (/\bsrc\s*=/i.test(m[1])) assert.equal(m[2].trim(), '', `${file}: body beside src`);
    }
  }
});

test('step 2: each layout script loads where its inline code ran', () => {
  const base = read(BASE);
  const at = (needle, from = 0) => {
    const i = base.indexOf(needle, from);
    assert.ok(i !== -1, `missing: ${needle}`);
    return i;
  };
  // Theme before first paint: blocking (no defer, async or module), right after the #themeCSS link.
  const themeLink = at('<link id="themeCSS"');
  const init = at('<script src="/js/site-theme-init.js"></script>');
  assert.ok(themeLink < init && init < at('</head>'));
  assert.doesNotMatch(base.slice(themeLink, init), /<script\b/i, 'nothing runs between the link and the theme script');
  assert.match(base, /<body\{% if page\?\.extra\?\.body_class %\} class="\{\{ page\.extra\.body_class \}\}"\{% endif %\}>/);

  // Footer TownSquare: the widget and the phone fit keep their condition; the offline fallback
  // keeps its wider one (it also serves the /townsquare/ page).
  const footerIf = at('{% if config.extra.townsquare.enabled and not (page?.extra?.no_footer_townsquare or false) %}');
  const footerEnd = at('{% endif %}', at('<script src="/js/site-townsquare-fit.js"></script>', footerIf));
  const footerBlock = base.slice(footerIf, footerEnd);
  // Inside: the outer if plus the site-key if, and only the site-key endif.
  assert.equal(footerBlock.split('{% if ').length - 1, 2);
  assert.equal(footerBlock.split('{% endif %}').length - 1, 1);
  assert.match(footerBlock, /<div id="townsquare-root" data-ts-origin="\{\{ config\.extra\.townsquare\.origin \}\}" data-ts-socket-path="\{\{ config\.extra\.townsquare\?\.socket_path or '\/live' \}\}"\{% if config\.extra\.townsquare\.site_key %\} data-ts-site-key="\{\{ config\.extra\.townsquare\.site_key \}\}"\{% endif %\}><\/div>/);
  assert.ok(footerBlock.indexOf('<script type="module" src="/js/site-townsquare-footer.js"></script>')
    < footerBlock.indexOf('<script src="/js/site-townsquare-fit.js"></script>'));
  assert.ok(footerBlock.indexOf('<script type="module" src="/js/site-townsquare-footer.js"></script>') !== -1);
  const offlineIf = at('{% if config.extra.townsquare.enabled %}', footerEnd);
  const offlineBlock = base.slice(offlineIf, at('{% endif %}', offlineIf));
  assert.match(offlineBlock, /<script src="\/js\/site-townsquare-offline\.js"><\/script>/);

  // End-of-page enhancements: after the footer, before the deferred weather script.
  const page = at('<script src="/js/site-page.js"></script>');
  assert.ok(at('</footer>') < page && page < at('<script src="/js/weather.js'));

  // The menu script follows the buttons it binds.
  for (const file of MENUS) {
    const menu = read(file);
    const nav = menu.indexOf('</nav>');
    assert.ok(nav !== -1 && nav < menu.indexOf('<script src="/js/site-menu.js"></script>'), file);
    assert.match(menu, /<button class="top-nav-hamburger" id="nav-hamburger" aria-label="Toggle navigation">/);
    assert.match(menu, /<button class="theme-toggle" id="theme-toggle" aria-label="Toggle theme">/);
  }
});

test('step 2: every site-*.js the layout loads exists, and none is orphaned', () => {
  const referenced = new Set();
  for (const file of LAYOUT) {
    for (const m of read(file).matchAll(/src="\/js\/(site-[a-z-]+\.js)"/g)) referenced.add(m[1]);
  }
  const present = new Set(fs.readdirSync(path.join(root, 'static/js')).filter((f) => /^site-.*\.js$/.test(f)));
  assert.deepEqual([...referenced].sort(), [...present].sort());
  assert.equal(present.size, 6);
});

test('step 2: reply pages keep one binding of the menu buttons (site-menu.js), not two', () => {
  assert.ok(!fs.existsSync(path.join(root, 'static/js/reply-page.js')), 'reply-page.js would bind the buttons a second time');
  assert.doesNotMatch(read('templates/reply-shell.html'), /reply-page\.js/);
  const binders = [];
  for (const dir of ['static/js', 'themes/ergo/static']) {
    for (const f of fs.readdirSync(path.join(root, dir)).filter((name) => name.endsWith('.js'))) {
      if (/nav-hamburger|theme-toggle/.test(read(`${dir}/${f}`))) binders.push(`${dir}/${f}`);
    }
  }
  assert.deepEqual(binders, ['static/js/site-menu.js']);
});

// Tiny DOM stand-ins for the vm checks.
function classList() {
  const set = new Set();
  return {
    set,
    toggle(name, force) {
      const on = force === undefined ? !set.has(name) : Boolean(force);
      if (on) set.add(name); else set.delete(name);
      return on;
    },
  };
}
function element(extra = {}) {
  const listeners = {};
  return {
    classList: classList(),
    listeners,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    fire(type) { for (const fn of listeners[type] || []) fn({}); },
    ...extra,
  };
}
function storage(initial) {
  const map = new Map(initial === undefined ? [] : [['ergo-theme', initial]]);
  const writes = [];
  return {
    writes,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { writes.push([k, v]); map.set(k, String(v)); },
  };
}

function runThemeInit(stored) {
  const link = { href: 'https://michaelreflects.com/default.css' };
  const html = element({ dataset: {} });
  const localStorage = storage(stored);
  const document = { documentElement: html, getElementById: (id) => (id === 'themeCSS' ? link : null) };
  vm.runInNewContext(read('static/js/site-theme-init.js'), { document, localStorage });
  return { link, html, localStorage };
}

test('step 2: the theme init file sets the theme before paint exactly as the inline code did', () => {
  const dark = runThemeInit('dark');
  assert.equal(dark.link.href, '/dark.css');
  assert.equal(dark.html.dataset.theme, 'dark');
  assert.deepEqual([...dark.html.classList.set], ['theme-dark']);
  assert.deepEqual(dark.localStorage.writes, []);

  const light = runThemeInit('default');
  assert.equal(light.link.href, 'https://michaelreflects.com/default.css');
  assert.deepEqual([...light.html.classList.set], ['theme-default']);
  assert.deepEqual(light.localStorage.writes, []);

  for (const bad of [undefined, 'neon']) {
    const fixed = runThemeInit(bad);
    assert.equal(fixed.html.dataset.theme, 'default');
    assert.deepEqual(fixed.localStorage.writes, [['ergo-theme', 'default']]);
  }
});

function menuContext({ withButtons = true } = {}) {
  const els = withButtons
    ? { 'nav-links': element(), 'nav-hamburger': element(), 'theme-toggle': element(), themeCSS: { href: '/default.css' },
      'theme-icon': { textContent: '' }, 'theme-label': { textContent: '' } }
    : {};
  const win = element();
  const context = {
    window: win,
    localStorage: storage(),
    document: { documentElement: element({ dataset: {} }), getElementById: (id) => els[id] || null },
  };
  vm.createContext(context);
  vm.runInContext(read('themes/ergo/static/theme_selector.js'), context);
  vm.runInContext(read('static/js/site-menu.js'), context);
  return { context, els, win };
}

test('step 2: site-menu.js binds the hamburger, the theme toggle and main() once each', () => {
  const { context, els, win } = menuContext();
  assert.equal(els['nav-hamburger'].listeners.click.length, 1);
  assert.equal(els['theme-toggle'].listeners.click.length, 1);
  assert.equal(win.listeners.load.length, 1);

  els['nav-hamburger'].fire('click');
  assert.ok(els['nav-links'].classList.set.has('open') && els['nav-hamburger'].classList.set.has('open'));
  els['nav-hamburger'].fire('click');
  assert.ok(!els['nav-links'].classList.set.has('open') && !els['nav-hamburger'].classList.set.has('open'));

  win.fire('load');
  assert.equal(els['theme-label'].textContent, 'Dark');
  els['theme-toggle'].fire('click');
  assert.equal(context.localStorage.getItem('ergo-theme'), 'dark');
  assert.equal(els.themeCSS.href, '/dark.css');
  assert.equal(els['theme-label'].textContent, 'Light');
  els['theme-toggle'].fire('click');
  assert.equal(context.localStorage.getItem('ergo-theme'), 'default');
  assert.equal(els['theme-label'].textContent, 'Dark');
});

test('step 2: site-menu.js is harmless on a page without the menu', () => {
  const { win } = menuContext({ withButtons: false });
  assert.doesNotThrow(() => win.fire('load'));
});

test('step 2: the footer TownSquare module mounts from the data attributes, with or without a site key', async () => {
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-layout-ts-'));
  const fakeModule = path.join(fake, 'townsquare.mjs');
  fs.writeFileSync(fakeModule, 'export function mountTownSquare(root, options) { globalThis.__tsMounts.push({ root, options }); }\n');
  const origin = pathToFileURL(fake).href;
  const moduleUrl = pathToFileURL(path.join(root, 'static/js/site-townsquare-footer.js')).href;
  const saved = globalThis.document;
  let run = 0;
  async function mount(attrs) {
    globalThis.__tsMounts = [];
    const appended = [];
    const rootEl = attrs && { getAttribute: (name) => (name in attrs ? attrs[name] : null) };
    globalThis.document = {
      getElementById: (id) => (id === 'townsquare-root' ? rootEl : null),
      createElement: (tag) => ({ tag }),
      head: { appendChild: (el) => appended.push(el) },
    };
    await import(`${moduleUrl}?run=${++run}`);
    return { rootEl, appended, mounts: globalThis.__tsMounts };
  }
  try {
    const keyed = await mount({ 'data-ts-origin': origin, 'data-ts-socket-path': '/live', 'data-ts-site-key': 'site_example' });
    assert.equal(keyed.mounts.length, 1);
    assert.equal(keyed.mounts[0].root, keyed.rootEl);
    assert.deepEqual(keyed.mounts[0].options, { serverOrigin: origin, socketPath: '/live', siteKey: 'site_example', theme: 'host' });
    assert.deepEqual(keyed.appended, [{ tag: 'link', rel: 'stylesheet', href: `${origin}/widget.css` }]);

    const keyless = await mount({ 'data-ts-origin': origin });
    assert.deepEqual(keyless.mounts[0].options, { serverOrigin: origin, socketPath: '/live', theme: 'host' });

    for (const absent of [null, {}]) {
      const none = await mount(absent);
      assert.deepEqual(none.mounts, []);
      assert.deepEqual(none.appended, []);
    }
  } finally {
    globalThis.document = saved;
    delete globalThis.__tsMounts;
    fs.rmSync(fake, { recursive: true, force: true });
  }
});

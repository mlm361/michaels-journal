// JOURNAL-FOOTER-NOSTR-01: the footer Nostr link goes to ditto.pub, and the ostrich animates
// only once in view, then returns to the still icon within 5 s (WCAG 2.2.2). Reduced motion,
// no IntersectionObserver or no JavaScript keep the still icon.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const STILL = 'https://media.mitchelltribe.xyz/site/img/nostr-icon.avif';
const ANIM = 'https://media.mitchelltribe.xyz/site/img/nostr-icon-animated-4x.avif';
const NPUB = 'npub19af39pdnr0cpg0ntakhdprfz8fkhkdn4t0f383gj0zw8hy4wf8lqh0nfur';

test('footer: the Nostr link opens ditto.pub, the markup shows the still icon, the script loads', () => {
  const base = read('themes/ergo/templates/base.html');
  const social = base.slice(base.indexOf('<div id="social_links">'), base.indexOf('</div>', base.indexOf('<div id="social_links">')));
  assert.match(social, new RegExp(`<a rel="me" href="https://ditto\\.pub/${NPUB}">`));
  assert.doesNotMatch(base, /iris\.to/);
  const img = social.match(/<img [^>]*alt="Nostr"[^>]*>/)[0];
  assert.match(img, new RegExp(`\\ssrc="${STILL.replace(/\./g, '\\.')}"`));
  assert.match(img, new RegExp(`\\sdata-anim-src="${ANIM.replace(/\./g, '\\.')}"`));
  assert.match(img, /width="24" height="24"/);
  assert.equal((base.match(/data-anim-src=/g) || []).length, 1, 'exactly one animated icon');
  assert.equal((base.match(/<script src="\/js\/footer-ostrich\.js" defer><\/script>/g) || []).length, 1);
  assert.ok(fs.existsSync(path.join(root, 'static/js/footer-ostrich.js')));
});

function run({ reduce = false, io = true, img = true } = {}) {
  const timers = [];
  const listeners = {};
  let observer = null;
  const el = img ? {
    attrs: { src: STILL, 'data-anim-src': ANIM },
    get src() { return this.attrs.src; },
    set src(v) { this.attrs.src = v; },
    getAttribute(name) { return this.attrs[name]; },
    addEventListener(type, fn, opts) { listeners[type] = { fn, opts }; },
  } : null;
  const window = { matchMedia: (q) => ({ matches: reduce && q === '(prefers-reduced-motion: reduce)' }) };
  if (io) {
    window.IntersectionObserver = function (cb) {
      observer = { cb, observed: [], disconnected: false };
      this.observe = (t) => observer.observed.push(t);
      this.disconnect = () => { observer.disconnected = true; };
    };
  }
  const context = {
    window,
    IntersectionObserver: window.IntersectionObserver,
    document: { querySelector: (sel) => (sel === 'img[data-anim-src]' ? el : null) },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  };
  vm.runInNewContext(read('static/js/footer-ostrich.js'), context);
  return { el, timers, listeners, observer: () => observer };
}

test('script: animates only after the icon enters the view, then restores the still icon within 5 s', () => {
  const r = run();
  assert.equal(r.el.src, STILL, 'still until visible');
  assert.deepEqual(r.observer().observed, [r.el]);
  r.observer().cb([{ isIntersecting: false }]);
  assert.equal(r.el.src, STILL, 'not visible yet');
  r.observer().cb([{ isIntersecting: true }]);
  assert.equal(r.el.src, ANIM, 'animated once visible');
  assert.equal(r.observer().disconnected, true, 'runs once');
  assert.equal(r.timers.length, 0, 'clock starts when the animation has loaded');
  assert.equal(r.listeners.load.opts.once, true, 'load listener runs once');
  r.listeners.load.fn();
  assert.equal(r.timers.length, 1);
  assert.ok(r.timers[0].ms <= 5000 && r.timers[0].ms >= 3600, `stop after ${r.timers[0].ms} ms`);
  r.timers[0].fn();
  assert.equal(r.el.src, STILL, 'still icon again');
});

test('script: reduced motion, no IntersectionObserver or no icon leave the still icon alone', () => {
  for (const opts of [{ reduce: true }, { io: false }]) {
    const r = run(opts);
    assert.equal(r.el.src, STILL, JSON.stringify(opts));
    assert.equal(r.observer(), null, JSON.stringify(opts));
  }
  assert.doesNotThrow(() => run({ img: false }));
});

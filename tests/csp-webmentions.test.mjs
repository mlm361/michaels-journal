// JOURNAL-CSP-01 Phase 3 step 4: the webmentions partial carries no inline code. Its script
// lives in static/js/page-webmentions.js and reads the page values (permalink, syndication
// URLs, Hub projection switch) from data attributes on #webmentions-wrap.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { scanPage } from '../tools/csp-inline-inventory.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const PARTIAL = 'themes/ergo/templates/partials/webmentions.html';
const SCRIPT = 'static/js/page-webmentions.js';
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

test('step 4: the webmentions partial has no inline script, no on* handler, no script body beside src', () => {
  const html = read(PARTIAL).replace(/\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g, '');
  assert.deepEqual(scanPage(html), [], 'inline code');
  assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i, 'on* attribute');
  assert.doesNotMatch(html, /data-csp-id/, 'inventory tag left behind');
  const srcs = [];
  for (const m of html.matchAll(SCRIPT_TAG)) {
    const src = /\bsrc="([^"]+)"/.exec(m[1]);
    assert.ok(src, 'every script has a src');
    assert.equal(m[2].trim(), '', 'body beside src');
    srcs.push(src[1]);
  }
  // Same order and place as before: threading helper first, then the page code, after the list.
  assert.deepEqual(srcs, ['/js/webmention-threading.js', '/js/page-webmentions.js']);
  assert.ok(read(PARTIAL).indexOf('</section>') < read(PARTIAL).indexOf('/js/page-webmentions.js'));
  assert.ok(!JSON.parse(read('csp/phase3-inline-inventory.json')).items['webmentions.1'], 'inventory entry removed');
});

test('step 4: the page values are data attributes; syndication ones only when the post has [extra.posse]', () => {
  const partial = read(PARTIAL);
  assert.match(partial, /data-wm-target="\{\{ page\.permalink \}\}"/);
  assert.match(partial, /data-wm-hub="\{\{ config\.extra\.webmention_hub_projection \}\}"/);
  const posse = /\{% if page\.extra\?\.posse %\}([\s\S]*?)\{% endif %\}>/.exec(partial);
  assert.ok(posse, 'posse attributes sit inside the posse condition');
  for (const name of ['bluesky', 'mastodon', 'sharkey', 'nostr']) {
    assert.match(posse[1], new RegExp(`data-wm-posse-${name}="\\{\\{ page\\.extra\\.posse\\?\\.${name} or '' \\}\\}"`));
  }
  assert.match(posse[1], /\bdata-wm-posse\b(?!-)/, 'marker attribute');
  const js = read(SCRIPT);
  assert.doesNotMatch(js, /\{\{|\{%/, 'no template code left in the file');
  assert.doesNotThrow(() => new vm.Script(js), 'file parses');
});

// Run the real file against a stub page and record what it fetches. Fetches that would
// lead to rendering never settle, so only the wiring is exercised.
async function run({ attrs, index = {} }) {
  const fetched = [];
  const never = new Promise(() => {});
  const wrap = {
    dataset: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [
      k.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v])),
    hasAttribute: (name) => Object.hasOwn(attrs, name),
  };
  const list = { addEventListener() {}, innerHTML: '' };
  const document = { getElementById: (id) => ({ 'webmentions-wrap': wrap, 'webmentions-list': list })[id] ?? null };
  const fetch = (url) => {
    fetched.push(url);
    if (url === '/engagement/index.json') return Promise.resolve({ json: () => index });
    return never;
  };
  vm.runInNewContext(read(SCRIPT), { document, fetch, window: {}, URL, encodeURIComponent, Promise });
  for (let i = 0; i < 5; i++) await new Promise(setImmediate);
  return fetched;
}

const PERMALINK = 'https://michaelreflects.com/blog/a-post/?x=1&y=2';

test('step 4: Hub on and a syndicated post: same target encoding and engagement lookup as before', async () => {
  const fetched = await run({
    attrs: {
      'data-wm-target': PERMALINK, 'data-wm-hub': 'true', 'data-wm-posse': '',
      'data-wm-posse-bluesky': '', 'data-wm-posse-mastodon': 'https://mitchelltribe.social/@m/1',
      'data-wm-posse-sharkey': '', 'data-wm-posse-nostr': '',
    },
    index: { 'https://mitchelltribe.social/@m/1': 'a-post' },
  });
  assert.deepEqual(fetched, [
    '/engagement/index.json',
    '/api/webmentions?target=' + encodeURIComponent(PERMALINK),
    '/engagement/a-post.json',
  ]);
});

test('step 4: Hub off and no [extra.posse]: no Hub call, and an empty-string index key is never used', async () => {
  // Before, a post without [extra.posse] had posseUrls = {} (no keys at all), so even an
  // index entry for "" could not match. The marker attribute keeps that.
  const fetched = await run({ attrs: { 'data-wm-target': PERMALINK, 'data-wm-hub': 'false' }, index: { '': 'wrong' } });
  assert.deepEqual(fetched, ['/engagement/index.json']);
});

// JOURNAL-CSP-01 Phase 2c, C1: the avatar Function (fail-closed manifest lease) and the
// transitional reader. Plan v5 §4 + Sally's 2026-11-25 0934 lease amendment.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { mock } from 'node:test';
import vm from 'node:vm';

import {
  MAX_LEASE_MS,
  manifestDeadline,
  onRequest,
  parseTimestamp,
} from '../functions/avatars/[kind]/[name].js';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const K1 = 'a'.repeat(64);
const K2 = '0123456789abcdef'.repeat(4);
const NOW = Date.parse('2026-11-25T12:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();
const MIN = 60 * 1000;

function manifest(kind, overrides = {}) {
  return {
    version: 1,
    prefix: kind,
    revision: 'r1',
    source_revision: 's1',
    confirmed_at: iso(NOW - 30 * MIN),
    generated_at: iso(NOW - 5 * MIN),
    valid_until: iso(NOW + 90 * MIN),
    keys: [K1],
    ...overrides,
  };
}

function r2Object(body, { contentType = 'image/webp', size } = {}) {
  const text = typeof body === 'string' ? body : '';
  return {
    size: size ?? (typeof body === 'string' ? Buffer.byteLength(body) : 1024),
    httpMetadata: contentType === null ? {} : { contentType },
    body,
    text: async () => text,
  };
}

// A fake R2 binding. `objects` maps keys to objects (or JSON-able manifests);
// `onGet` lets a test move the clock while a read is in flight.
function bucket(objects, { onGet } = {}) {
  const calls = [];
  const lookup = (key) => {
    const value = objects[key];
    if (value === undefined) return null;
    if (key.startsWith('manifest/') && !('httpMetadata' in Object(value))) {
      return r2Object(typeof value === 'string' ? value : JSON.stringify(value), { contentType: 'application/json' });
    }
    return value;
  };
  return {
    calls,
    async get(key) { calls.push(['get', key]); if (onGet) onGet(key); return lookup(key); },
    async head(key) { calls.push(['head', key]); if (onGet) onGet(key); return lookup(key); },
    async put() { throw new Error('the Function must never write'); },
    async delete() { throw new Error('the Function must never delete'); },
    async list() { throw new Error('the Function must never list'); },
  };
}

function call(kind, name, b, method = 'GET') {
  return onRequest({ params: { kind, name }, env: { AVATARS: b }, request: { method } });
}

let clock = NOW;
mock.method(Date, 'now', () => clock);
const at = (ms) => { clock = ms; };

const webp = () => r2Object('RIFF....WEBPVP8 ', { size: 2048 });
const good = (kind = 'webmention') => ({ [`manifest/${kind}.json`]: manifest(kind), [`${kind}/${K1}.webp`]: webp() });

test('a listed key in a fresh manifest: 200 with the exact headers, GET and HEAD', async () => {
  for (const kind of ['engagement', 'webmention']) {
    at(NOW);
    const res = await call(kind, `${K1}.webp`, bucket(good(kind)));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/webp');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; sandbox");
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(res.headers.get('cache-control'), 'private, max-age=300, must-revalidate');
    assert.equal(res.headers.get('content-length'), '2048');

    const b = bucket(good(kind));
    const head = await call(kind, `${K1}.webp`, b, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, null);
    assert.deepEqual(b.calls, [['get', `manifest/${kind}.json`], ['head', `${kind}/${K1}.webp`]]);
  }
});

test('bad kind or bad name is 404 without touching R2', async () => {
  at(NOW);
  const cases = [
    ['other', `${K1}.webp`],
    ['manifest', 'engagement.json'],
    ['Webmention', `${K1}.webp`],
    ['webmention', `${K1}.png`],
    ['webmention', `${K1.toUpperCase()}.webp`],
    ['webmention', `${K1.slice(1)}.webp`],
    ['webmention', `${K1}0.webp`],
    ['webmention', '..'],
    ['webmention', `..%2F${K1}.webp`],
    ['webmention', ['x', `${K1}.webp`]],
    [undefined, `${K1}.webp`],
  ];
  for (const [kind, name] of cases) {
    const b = bucket(good());
    const res = await call(kind, name, b);
    assert.equal(res.status, 404, `${kind}/${name}`);
    assert.deepEqual(b.calls, [], `${kind}/${name} touched R2`);
  }
});

test('the object must be WebP and at most 65,536 bytes', async () => {
  at(NOW);
  const objects = (obj) => ({ 'manifest/webmention.json': manifest('webmention'), [`webmention/${K1}.webp`]: obj });
  assert.equal((await call('webmention', `${K1}.webp`, bucket(objects(r2Object('x', { contentType: 'image/png' }))))).status, 404);
  assert.equal((await call('webmention', `${K1}.webp`, bucket(objects(r2Object('<svg/>', { contentType: 'image/svg+xml' }))))).status, 404);
  assert.equal((await call('webmention', `${K1}.webp`, bucket(objects(r2Object('x', { contentType: null }))))).status, 404);
  assert.equal((await call('webmention', `${K1}.webp`, bucket(objects(r2Object('x', { size: 70 * 1024 }))))).status, 404);
  assert.equal((await call('webmention', `${K1}.webp`, bucket(objects(r2Object('x', { size: 65537 }))))).status, 404);
  assert.equal((await call('webmention', `${K1}.webp`, bucket(objects(r2Object('x', { size: 65536 }))))).status, 200);
  assert.equal((await call('webmention', `${K1}.webp`, bucket({ 'manifest/webmention.json': manifest('webmention') }))).status, 404);
});

test('fail closed on any manifest problem, before the object is read', async () => {
  at(NOW);
  const bad = [
    ['missing', undefined],
    ['not JSON', '{nope'],
    ['an array', '[]'],
    ['version 2', manifest('webmention', { version: 2 })],
    ['version "1"', manifest('webmention', { version: '1' })],
    ['prefix of the other kind', manifest('engagement')],
    ['key not listed', manifest('webmention', { keys: [K2] })],
    ['keys not an array', manifest('webmention', { keys: K1 })],
    ['a malformed key in keys', manifest('webmention', { keys: [K1, 'ZZ'] })],
    ['valid_until without Z', manifest('webmention', { valid_until: '2026-11-25T13:30:00' })],
    ['valid_until with an offset', manifest('webmention', { valid_until: '2026-11-25T13:30:00+00:00' })],
    ['valid_until as a number', manifest('webmention', { valid_until: NOW + 90 * MIN })],
    ['confirmed_at impossible date', manifest('webmention', { confirmed_at: '2026-02-31T11:30:00Z' })],
    ['generated_at missing', manifest('webmention', { generated_at: undefined })],
  ];
  for (const [label, value] of bad) {
    const objects = { [`webmention/${K1}.webp`]: webp() };
    if (value !== undefined) objects['manifest/webmention.json'] = value;
    const b = bucket(objects);
    const res = await call('webmention', `${K1}.webp`, b);
    assert.equal(res.status, 404, label);
    assert.equal(res.headers.get('cache-control'), 'no-store', label);
    assert.deepEqual(b.calls, [['get', 'manifest/webmention.json']], `${label}: object read`);
  }
});

test('over-120 configuration rejection: valid_until may not exceed confirmed_at + 120 min', async () => {
  at(NOW);
  const confirmed = NOW - 30 * MIN;
  const exactly = manifest('webmention', { confirmed_at: iso(confirmed), valid_until: iso(confirmed + 120 * MIN) });
  assert.equal((await call('webmention', `${K1}.webp`, bucket({ 'manifest/webmention.json': exactly, [`webmention/${K1}.webp`]: webp() }))).status, 200);
  const over = manifest('webmention', { confirmed_at: iso(confirmed), valid_until: iso(confirmed + 120 * MIN + 1) });
  assert.equal((await call('webmention', `${K1}.webp`, bucket({ 'manifest/webmention.json': over, [`webmention/${K1}.webp`]: webp() }))).status, 404);
  const lease180 = manifest('webmention', { confirmed_at: iso(confirmed), valid_until: iso(confirmed + 180 * MIN) });
  assert.equal((await call('webmention', `${K1}.webp`, bucket({ 'manifest/webmention.json': lease180, [`webmention/${K1}.webp`]: webp() }))).status, 404);
  assert.equal(MAX_LEASE_MS, 120 * 60 * 1000);
});

test('idempotent replay: rewriting the manifest from the same confirmation never extends the deadline', async () => {
  const confirmed = NOW - 100 * MIN;
  const deadline = confirmed + 120 * MIN;
  // The same confirmation re-published with a newer generated_at: the deadline stays put.
  const replay = manifest('webmention', { confirmed_at: iso(confirmed), generated_at: iso(NOW), valid_until: iso(deadline) });
  for (const t of [NOW, NOW + 10 * MIN, deadline - 3000]) {
    at(t);
    assert.equal(manifestDeadline(replay, 'webmention', K1), deadline);
    assert.equal((await call('webmention', `${K1}.webp`, bucket({ 'manifest/webmention.json': replay, [`webmention/${K1}.webp`]: webp() }))).status, 200);
  }
  at(deadline);
  assert.equal((await call('webmention', `${K1}.webp`, bucket({ 'manifest/webmention.json': replay, [`webmention/${K1}.webp`]: webp() }))).status, 404);
  // A replay that tries to push the deadline out is the over-120 case and is refused.
  const pushed = { ...replay, valid_until: iso(NOW + 120 * MIN) };
  assert.equal(manifestDeadline(pushed, 'webmention', K1), null);
});

test('expiry: 404 at valid_until and after, without reading the object', async () => {
  const deadline = NOW + 90 * MIN;
  for (const t of [deadline, deadline + 1, deadline + 60 * MIN]) {
    at(t);
    const b = bucket(good());
    assert.equal((await call('webmention', `${K1}.webp`, b)).status, 404);
    assert.deepEqual(b.calls, [['get', 'manifest/webmention.json']]);
  }
});

test('Cache-Control max-age shrinks toward valid_until and never passes it', async () => {
  const deadline = NOW + 90 * MIN;
  const cases = [
    [deadline - 60 * MIN, 300],
    [deadline - 300500, 299],
    [deadline - 100500, 99],
    [deadline - 10000, 9],
    [deadline - 2500, 1],
    [deadline - 2000, 1],
  ];
  for (const [t, maxAge] of cases) {
    at(t);
    const res = await call('webmention', `${K1}.webp`, bucket(good()));
    assert.equal(res.status, 200, `t=${deadline - t}ms before`);
    assert.equal(res.headers.get('cache-control'), `private, max-age=${maxAge}, must-revalidate`);
    assert.ok((t + maxAge * 1000) < deadline, 'a cached copy expires before the deadline');
  }
  at(deadline - 1999);
  assert.equal((await call('webmention', `${K1}.webp`, bucket(good()))).status, 404, 'under 2 s left is 404');
});

test('a slow object fetch that crosses expiry is 404 (remaining time measured at the response boundary)', async () => {
  const deadline = NOW + 90 * MIN;
  for (const [start, after, expected] of [
    [deadline - 60000, deadline + 5000, 404],     // fetch ran past valid_until
    [deadline - 60000, deadline - 1500, 404],     // fetch left under 2 s
    [deadline - 60000, deadline - 30000, 200],    // fetch slow but inside the window
  ]) {
    at(start);
    const b = bucket(good(), { onGet: (key) => { if (key.endsWith('.webp')) at(after); } });
    const res = await call('webmention', `${K1}.webp`, b);
    assert.equal(res.status, expected, `fetch ended ${deadline - after} ms before the deadline`);
    if (expected === 200) {
      assert.equal(res.headers.get('cache-control'), 'private, max-age=29, must-revalidate');
    }
  }
});

test('a key removed from the manifest is 404 on the next request; a fresh manifest restores it', async () => {
  const objects = good();
  at(NOW);
  assert.equal((await call('webmention', `${K1}.webp`, bucket(objects))).status, 200);
  objects['manifest/webmention.json'] = manifest('webmention', { keys: [K2] });
  assert.equal((await call('webmention', `${K1}.webp`, bucket(objects))).status, 404);
  objects['manifest/webmention.json'] = manifest('webmention', { keys: [K2, K1] });
  assert.equal((await call('webmention', `${K1}.webp`, bucket(objects))).status, 200);
});

test('the kinds are isolated: an engagement manifest cannot serve a webmention picture', async () => {
  at(NOW);
  const b = bucket({ 'manifest/engagement.json': manifest('engagement'), [`webmention/${K1}.webp`]: webp() });
  assert.equal((await call('webmention', `${K1}.webp`, b)).status, 404);
});

test('GET and HEAD only; no binding is 404', async () => {
  at(NOW);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const res = await call('webmention', `${K1}.webp`, bucket(good()), method);
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get('allow'), 'GET, HEAD');
  }
  const res = await onRequest({ params: { kind: 'webmention', name: `${K1}.webp` }, env: {}, request: { method: 'GET' } });
  assert.equal(res.status, 404);
});

test('version pin: the Function keeps the manifest check, the lease bound and no writes or caches', () => {
  const source = read('functions/avatars/[kind]/[name].js');
  assert.match(source, /manifestDeadline\(await readManifest\(bucket, kind\), kind, stem\)/);
  assert.match(source, /validUntil > confirmedAt \+ MAX_LEASE_MS/);
  assert.match(source, /const remainingMs = deadline - Date\.now\(\);/);
  assert.doesNotMatch(source, /\.(put|delete|list|createMultipartUpload)\(/);
  assert.doesNotMatch(source, /\bcaches\b|cf:\s*\{|cacheEverything|cacheTtl/);
  assert.equal(parseTimestamp('2026-11-25T12:00:00Z'), NOW);
  assert.equal(parseTimestamp('2026-11-25T12:00:00.123Z'), NOW + 123);
  assert.ok(Number.isNaN(parseTimestamp('2026-11-25 12:00:00Z')));
});

test('routes: /avatars/* reaches the Function', () => {
  const routes = JSON.parse(read('static/_routes.json'));
  assert.ok(routes.include.includes('/avatars/*'));
  assert.ok(routes.include.includes('/tweets/media/*'));
  assert.ok(routes.include.length <= 100);
});

test('transitional reader: same-origin avatar paths or public URLs; anything else is no photo', () => {
  const template = read('themes/ergo/templates/partials/webmentions.html');
  const context = vm.createContext({ window: {}, URL });
  vm.runInContext(read('static/js/url-safety.js'), context);
  vm.runInContext(template.slice(template.indexOf('    function escapeHtml'),
                                 template.indexOf('    function initialFor')), context);
  const photo = (value) => context.authorPhoto({ author: { photo: value } });

  assert.equal(photo(`/avatars/webmention/${K1}.webp`), `/avatars/webmention/${K1}.webp`);
  assert.equal(photo(`/avatars/engagement/${K2}.webp`), `/avatars/engagement/${K2}.webp`);
  assert.equal(photo('https://cdn.bsky.app/img/avatar/plain/did/x@jpeg'), 'https://cdn.bsky.app/img/avatar/plain/did/x@jpeg');
  assert.equal(photo('https://avatars.webmention.io/x.png'), 'https://avatars.webmention.io/x.png');
  for (const bad of [
    `/avatars/other/${K1}.webp`,
    `/avatars/webmention/${K1.toUpperCase()}.webp`,
    `/avatars/webmention/${K1}.webp?x=1`,
    `/avatars/webmention/../${K1}.webp`,
    `//evil.example/avatars/webmention/${K1}.webp`,
    `/avatars/webmention/${K1}.webp\n`,
    '/relative/path.webp',
    'javascript:alert(1)',
    'data:image/webp;base64,AAAA',
  ]) {
    assert.equal(photo(bad), '', JSON.stringify(bad));
  }
  assert.equal(context.authorPhoto({ author: {} }), '');
  assert.equal(context.authorPhoto({}), '');
});

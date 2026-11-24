// JOURNAL-CSP-01 Phase 2b, part B: the CSP violation collector against a D1 stand-in on
// node:sqlite (same SQL, real transactions). Preview D1 is exercised by the browser suite.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { DAILY_KEYS, _clearCache, handle, itemBucket, parseLegacy, parseModern, sha16 } from '../functions/_shared/csp-report-core.js';

const root = path.resolve(import.meta.dirname, '..');
const SCHEMA = fs.readFileSync(path.join(root, 'csp/d1-schema.sql'), 'utf8');
const ENFORCE = fs.readFileSync(path.join(root, 'csp/phase2.policy'), 'utf8').trimEnd();
const RO = fs.readFileSync(path.join(root, 'csp/phase3-report-only.policy'), 'utf8').trimEnd();
const LEGACY_FX = fs.readFileSync(path.join(root, 'csp/fixture-legacy.policy'), 'utf8').trimEnd();

class D1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(SCHEMA);
    this.batches = 0;
  }
  prepare(sql) {
    return { bind: (...args) => ({ sql, args }) };
  }
  async batch(stmts) {
    this.batches++;
    this.db.exec('BEGIN');
    try {
      for (const s of stmts) this.db.prepare(s.sql).run(...s.args);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  rows() {
    return this.db.prepare('SELECT * FROM agg ORDER BY policy_id, directive, blocked, page_id, item_id').all().map((r) => ({ ...r }));
  }
}

const PAGE = '/blog/hello/';
// 12 hex of the SHA-256, as tools/csp-inline-inventory.mjs names inline handlers.
const h12 = (value) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
async function assets({ mode = 'production', previewHost = null, policies } = {}) {
  const files = {
    '/__csp/meta.json': {
      version: 1, mode, canonical_host: 'michaelreflects.com', preview_host: previewHost,
      policies: policies || { 'enforce-2b': ENFORCE, 'ro-phase3': RO, ...(mode === 'preview' ? { 'fixture-legacy': LEGACY_FX } : {}) },
      hosts: ['*.archive.org', 'tinylytics.app', 'townsquare.michaelreflects.com'],
    },
    '/__csp/routes.json': ['/', PAGE, '/__csp-fixture/legacy/'],
    // [id, line, col, endLine]
    [`/__csp/pos/${await sha16(PAGE)}.json`]: [['handler:body.onload:abc', 10, 3, 10], ['base.1', 12, 9, 12], ['base.2', 20, 9, 21], ['webmentions.1', 30, 1, 30], ['content:feed', 30, 40, 30],
      [`handler:button.onclick:${h12('toggleNav()')}`, 40, 5, 40]],
  };
  return {
    fetch: async (req) => {
      const p = new URL(req.url).pathname;
      return p in files ? new Response(JSON.stringify(files[p]), { status: 200 }) : new Response('nope', { status: 404 });
    },
  };
}

async function env(opts = {}) {
  _clearCache();
  return { ASSETS: await assets(opts), CSP_REPORTS: new D1() };
}

const post = (body, { host = 'michaelreflects.com', type = 'application/csp-report', headers = {} } = {}) =>
  new Request(`https://${host}/api/csp-report`, { method: 'POST', headers: { 'Content-Type': type, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

const legacy = (over = {}) => ({ 'csp-report': {
  'document-uri': `https://michaelreflects.com${PAGE}?utm=secret#frag`, 'effective-directive': 'img-src',
  'blocked-uri': 'https://evil.example/x.png?token=1', 'original-policy': ENFORCE, disposition: 'enforce',
  'line-number': 1, 'column-number': 1, ...over } });
const modern = (body = {}) => ({ type: 'csp-violation', url: `https://michaelreflects.com${PAGE}`, body: {
  documentURL: `https://michaelreflects.com${PAGE}`, effectiveDirective: 'script-src-elem', blockedURL: 'inline',
  originalPolicy: RO, disposition: 'report', lineNumber: 12, columnNumber: 9, sample: 'alert(document.cookie)', ...body } });

test('collector: only POST with the two report types, size capped, own security headers', async () => {
  const e = await env();
  const r405 = await handle(new Request('https://michaelreflects.com/api/csp-report'), e);
  assert.equal(r405.status, 405);
  assert.equal(r405.headers.get('Allow'), 'POST');
  assert.equal((await handle(post(legacy(), { type: 'application/json' }), e)).status, 415);
  assert.equal((await handle(post(legacy(), { type: 'text/plain' }), e)).status, 415);
  assert.equal((await handle(post('x'.repeat(100), { headers: { 'Content-Length': String(64 * 1024 + 1) } }), e)).status, 413);
  assert.equal((await handle(post(JSON.stringify(legacy()) + ' '.repeat(65 * 1024)), e)).status, 413, 'cap while reading');
  assert.equal((await handle(post('{not json'), e)).status, 400);
  const ok = await handle(post(legacy()), e);
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('Content-Security-Policy'), "default-src 'none'; frame-ancestors 'none'");
  assert.equal(ok.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(ok.headers.get('Cache-Control'), 'no-store');
  assert.equal((await handle(post(legacy(), { type: 'application/csp-report; charset=utf-8' }), e)).status, 204);
});

test('collector: stores only fixed buckets (no query, foreign host, sample or caller path)', async () => {
  const e = await env();
  await handle(post(legacy()), e);
  await handle(post([modern(), { type: 'deprecation', body: {} }, modern({ documentURL: 'https://evil.example/blog/hello/' })],
    { type: 'application/reports+json' }), e);
  await handle(post(legacy({ 'document-uri': 'https://michaelreflects.com/not/a/route/', 'blocked-uri': 'https://tinylytics.app/x.js', 'effective-directive': 'script-src-elem' })), e);
  await handle(post(legacy({ 'blocked-uri': 'https://ia800.us.archive.org/a.jpg' })), e);
  await handle(post(legacy({ 'blocked-uri': 'data', 'effective-directive': 'made-up-directive' })), e);
  const rows = e.CSP_REPORTS.rows();
  const dump = JSON.stringify(rows);
  for (const bad of ['utm', 'secret', 'frag', 'token', 'evil.example', 'cookie', 'alert', '/not/a/route/', 'x.png', 'ia800']) {
    assert.ok(!dump.includes(bad), `stored ${bad}`);
  }
  const key = (r) => [r.policy_id, r.disposition, r.directive, r.blocked, r.page_id, r.item_id, r.n].join(' ');
  assert.deepEqual(rows.map(key).sort(), [
    'enforce-2b enforce img-src *.archive.org /blog/hello/ none 1',
    'enforce-2b enforce img-src other-external /blog/hello/ none 1',
    'enforce-2b enforce other data /blog/hello/ none 1',
    'enforce-2b enforce script-src-elem tinylytics.app other none 1',
    'ro-phase3 report script-src-elem inline /blog/hello/ base.1 1',
    'ro-phase3 report script-src-elem inline other ambiguous 1',
  ].sort());
  assert.ok(rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day)));
});

test('collector: unknown policies and mismatched dispositions are dropped', async () => {
  const e = await env();
  await handle(post(legacy({ 'original-policy': "default-src 'none'" })), e);
  await handle(post(legacy({ disposition: 'report' })), e, {});
  await handle(post([modern({ disposition: 'enforce' }), modern({ originalPolicy: ENFORCE + '; img-src *' })], { type: 'application/reports+json' }), e);
  await handle(post(legacy({ 'original-policy': LEGACY_FX })), e, {});
  assert.deepEqual(e.CSP_REPORTS.rows(), [], 'fixture policies are unknown in production');
  await handle(post(legacy({ disposition: undefined })), e);
  assert.equal(e.CSP_REPORTS.rows().length, 1, 'a missing disposition takes the policy own disposition');
});

test('collector: writes only on the canonical host in production and the build host in preview', async () => {
  for (const host of ['michaels-journal.pages.dev', 'abc12345.michaels-journal.pages.dev', 'www.michaelreflects.com']) {
    const e = await env();
    assert.equal((await handle(post(legacy(), { host }), e)).status, 204);
    assert.equal(e.CSP_REPORTS.batches, 0, `production deployment must not write at ${host}`);
  }
  const p = await env({ mode: 'preview', previewHost: 'abc12345.michaels-journal.pages.dev' });
  await handle(post(legacy({ 'document-uri': 'https://old999.michaels-journal.pages.dev/' }), { host: 'old999.michaels-journal.pages.dev' }), p);
  await handle(post(legacy(), { host: 'michaelreflects.com' }), p);
  assert.equal(p.CSP_REPORTS.batches, 0, 'a preview deployment writes only at its own host');
  await handle(post(legacy({ 'document-uri': 'https://abc12345.michaels-journal.pages.dev/__csp-fixture/legacy/', 'original-policy': LEGACY_FX,
    'effective-directive': 'script-src-elem', 'blocked-uri': 'inline' }), { host: 'abc12345.michaels-journal.pages.dev' }), p);
  assert.deepEqual(p.CSP_REPORTS.rows().map((r) => [r.policy_id, r.page_id, r.blocked]), [['fixture-legacy', '/__csp-fixture/legacy/', 'inline']]);
  const noBinding = { ASSETS: (await env()).ASSETS };
  assert.equal((await handle(post(legacy()), noBinding)).status, 204, 'no binding: accept and drop');
});

test('collector: at most 20 records per request; identical keys coalesce into one statement', async () => {
  const e = await env();
  const many = Array.from({ length: 30 }, () => modern());
  await handle(post(many, { type: 'application/reports+json' }), e);
  const rows = e.CSP_REPORTS.rows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].n, 20);
  assert.equal(e.CSP_REPORTS.batches, 1);
});

test('collector: attribution by position, handlers separately, ambiguity reported', () => {
  const pos = [['handler:body.onload:abc', 10, 3, 10], ['base.1', 12, 9, 12], ['base.2', 20, 9, 21], ['webmentions.1', 30, 1, 30], ['content:feed', 30, 40, 30]];
  assert.equal(itemBucket(pos, 'script-src-elem', 12, 9), 'base.1');
  assert.equal(itemBucket(pos, 'script-src-elem', 21, 1), 'base.2', 'inside a multi-line opening');
  assert.equal(itemBucket(pos, 'script-src-attr', 10, 3), 'handler:body.onload:abc');
  assert.equal(itemBucket(pos, 'script-src-elem', 10, 3), 'ambiguous', 'a handler line is not a script');
  assert.equal(itemBucket(pos, 'script-src-elem', 30, 40), 'content:feed', 'same line, exact column');
  assert.equal(itemBucket(pos, 'script-src-elem', 30, 5), 'ambiguous');
  assert.equal(itemBucket(pos, 'script-src-elem', 99, 1), 'ambiguous');
  assert.equal(itemBucket(null, 'script-src-elem', 12, 9), 'ambiguous');
  assert.equal(itemBucket(pos, 'script-src-elem', 'x', 9), 'ambiguous');
});

test('collector: handlers by sample hash first (Chromium reports them at 0:0 or a wrong position)', async () => {
  const nav = `handler:button.onclick:${h12('toggleNav()')}`;
  const same = h12('go()');
  const pos = [[nav, 40, 5, 40], [`handler:a.onclick:${same}`, 50, 1, 50], [`handler:div.onclick:${same}`, 51, 1, 51], ['base.1', 12, 9, 12]];
  assert.equal(itemBucket(pos, 'script-src-attr', 0, 0, h12('toggleNav()')), nav, 'line 0 still attributes');
  assert.equal(itemBucket(pos, 'script-src-attr', 12, 9, h12('toggleNav()')), nav, 'sample beats a wrong position');
  assert.equal(itemBucket(pos, 'script-src-attr', 0, 0, same), 'ambiguous', 'two ids with one value');
  assert.equal(itemBucket(pos, 'script-src-attr', 50, 1, same), `handler:a.onclick:${same}`, 'then position decides');
  assert.equal(itemBucket(pos, 'script-src-attr', 0, 0, h12('unknown()')), 'ambiguous');
  assert.equal(itemBucket(pos, 'script-src-elem', 0, 0, h12('toggleNav()')), 'ambiguous', 'scripts never use the sample');
  assert.equal(itemBucket(pos, 'script-src-attr', 0, 0, 'not-hex'), 'ambiguous');

  // End to end: both wire formats, the sample is used and not stored.
  const e = await env();
  await handle(post([modern({ effectiveDirective: 'script-src-attr', lineNumber: 0, columnNumber: 0, sample: 'toggleNav()' })], { type: 'application/reports+json' }), e);
  await handle(post({ 'csp-report': { 'document-uri': `https://michaelreflects.com${PAGE}`, 'effective-directive': 'script-src-attr',
    'blocked-uri': 'inline', 'original-policy': RO, disposition: 'report', 'line-number': 793, 'column-number': 35, 'script-sample': 'toggleNav()' } }), e);
  const rows = e.CSP_REPORTS.rows();
  assert.deepEqual(rows.map((r) => [r.policy_id, r.directive, r.blocked, r.page_id, r.item_id, r.n]), [['ro-phase3', 'script-src-attr', 'inline', PAGE, nav, 2]]);
  assert.doesNotMatch(JSON.stringify(rows), /toggleNav|\(\)/);
});

test('collector: the two parsers accept only their own schema', () => {
  assert.deepEqual(parseModern({ 'csp-report': {} }), []);
  assert.deepEqual(parseLegacy([{ type: 'csp-violation', body: {} }]), []);
  assert.equal(parseModern([{ type: 'csp-violation', body: null }, { type: 'network-error', body: {} }]).length, 0);
  assert.equal(parseLegacy({ 'csp-report': 'x' }).length, 0);
  assert.equal(parseLegacy({ 'csp-report': { 'violated-directive': 'img-src https:' } })[0].directive, 'img-src');
});

test('collector: the daily cap is exact, overflow is a separate counter, existing keys keep counting', async () => {
  const e = await env();
  // *.archive.org hosts all bucket to one value, so make distinct keys from directive x page x blocked words.
  const words = ['data', 'blob', 'inline', 'eval', 'wasm-eval', 'https://tinylytics.app/', 'https://townsquare.michaelreflects.com/', 'https://a.archive.org/', 'https://x.example/', 'https://michaelreflects.com/'];
  const directives = ['img-src', 'connect-src', 'frame-src', 'media-src', 'font-src', 'style-src-elem', 'style-src-attr', 'script-src-attr', 'worker-src', 'object-src', 'form-action', 'base-uri', 'frame-ancestors', 'other-thing'];
  const pages = ['/', PAGE, '/__csp-fixture/legacy/', '/missing/'];
  const records = [];
  for (const p of pages) for (const d of directives) for (const b of words) {
    records.push(legacy({ 'document-uri': `https://michaelreflects.com${p}`, 'effective-directive': d, 'blocked-uri': b }));
  }
  // directive 'other-thing' -> 'other', '/missing/' -> 'other': still distinct combinations; dedupe by computing.
  for (let i = 0; i < records.length; i += 20) {
    await handle(post(records.slice(i, i + 20).map((r) => ({ type: 'csp-violation', body: {
      documentURL: r['csp-report']['document-uri'], effectiveDirective: r['csp-report']['effective-directive'], blockedURL: r['csp-report']['blocked-uri'],
      originalPolicy: ENFORCE, disposition: 'enforce' } })), { type: 'application/reports+json' }), e);
  }
  const rows = e.CSP_REPORTS.rows();
  const regular = rows.filter((r) => r.directive !== 'overflow');
  const overflow = rows.filter((r) => r.directive === 'overflow');
  assert.equal(regular.length, DAILY_KEYS, 'exactly 500 regular rows');
  assert.equal(overflow.length, 1);
  assert.deepEqual([overflow[0].blocked, overflow[0].page_id, overflow[0].item_id], ['overflow', 'overflow', 'none']);
  const total = rows.reduce((s, r) => s + r.n, 0);
  assert.equal(total, records.length, 'no report lost: regular + overflow = all reports');
  // An existing key still increments at the cap; a new key goes to overflow.
  const first = regular[0];
  const before = overflow[0].n;
  await handle(post([{ type: 'csp-violation', body: { documentURL: `https://michaelreflects.com${first.page_id === 'other' ? '/missing/' : first.page_id}`,
    effectiveDirective: first.directive === 'other' ? 'other-thing' : first.directive, blockedURL: first.blocked === 'self' ? 'https://michaelreflects.com/' : first.blocked,
    originalPolicy: ENFORCE, disposition: 'enforce' } }], { type: 'application/reports+json' }), e);
  const after = e.CSP_REPORTS.rows();
  assert.equal(after.filter((r) => r.directive !== 'overflow').length, DAILY_KEYS);
  assert.equal(after.find((r) => r.directive === 'overflow').n, before, 'the existing key did not overflow');
  // The other policy has its own 500.
  await handle(post([modern()], { type: 'application/reports+json' }), e);
  assert.ok(e.CSP_REPORTS.rows().some((r) => r.policy_id === 'ro-phase3' && r.directive !== 'overflow'));
});

test('collector: concurrent requests lose no increments, and the cap holds under a boundary race', async () => {
  const e = await env();
  await Promise.all(Array.from({ length: 50 }, () => handle(post(legacy()), e)));
  assert.deepEqual(e.CSP_REPORTS.rows().map((r) => r.n), [50]);
  // Boundary race: fill to 499 regular rows, then 30 different new keys arrive at once.
  const race = await env();
  const directives = ['img-src', 'connect-src', 'frame-src', 'media-src', 'font-src', 'style-src-elem', 'style-src-attr', 'script-src-attr', 'worker-src', 'object-src', 'form-action', 'base-uri', 'frame-ancestors', 'other-thing'];
  const words = ['data', 'blob', 'inline', 'eval', 'wasm-eval', 'https://tinylytics.app/', 'https://townsquare.michaelreflects.com/', 'https://a.archive.org/', 'https://x.example/', 'https://michaelreflects.com/'];
  const pages = ['/', PAGE, '/__csp-fixture/legacy/', '/missing/'];
  const all = [];
  for (const p of pages) for (const d of directives) for (const b of words) all.push({ p, d, b });
  const body = ({ p, d, b }) => [{ type: 'csp-violation', body: { documentURL: `https://michaelreflects.com${p}`, effectiveDirective: d, blockedURL: b, originalPolicy: ENFORCE, disposition: 'enforce' } }];
  // Keys that normalize to the same bucket ('other' directive or page) collapse; count real distinct keys.
  for (const k of all.slice(0, 499)) await handle(post(body(k), { type: 'application/reports+json' }), race);
  const regularBefore = race.CSP_REPORTS.rows().filter((r) => r.directive !== 'overflow').length;
  await Promise.all(all.slice(499, 529).map((k) => handle(post(body(k), { type: 'application/reports+json' }), race)));
  const rows = race.CSP_REPORTS.rows();
  assert.ok(regularBefore <= DAILY_KEYS);
  assert.ok(rows.filter((r) => r.directive !== 'overflow').length <= DAILY_KEYS, 'never more than 500 regular rows');
  assert.equal(rows.reduce((s, r) => s + r.n, 0), 529, 'every report is counted somewhere');
});

test('collector: /api/csp-report is routed to Functions (static/_routes.json)', () => {
  const routes = JSON.parse(fs.readFileSync(path.join(root, 'static/_routes.json'), 'utf8'));
  assert.ok(routes.include.includes('/api/csp-report'), 'without it Pages serves 404/405 and no report is stored');
  assert.ok(!routes.exclude.some((r) => r === '/api/*' || r === '/api/csp-report'));
});

test('collector: a batch is all-or-nothing', async () => {
  const d1 = new D1();
  const good = d1.prepare("INSERT INTO agg VALUES ('2026-11-23','enforce-2b','enforce','img-src','data','/','none',1)").bind();
  const bad = d1.prepare('INSERT INTO agg (day) VALUES (?1)').bind('2026-11-23');
  await assert.rejects(() => d1.batch([good, bad]));
  assert.deepEqual(d1.rows(), []);
});

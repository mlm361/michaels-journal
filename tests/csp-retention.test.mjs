// JOURNAL-CSP-01 Phase 2b, part C: the retention Worker against D1 stand-ins on node:sqlite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { RETENTION_DAYS, cutoff, runRetention } from '../workers/csp-retention/index.js';

const root = path.resolve(import.meta.dirname, '..');
const SCHEMA = fs.readFileSync(path.join(root, 'csp/d1-schema.sql'), 'utf8');

function d1(days) {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  const ins = db.prepare("INSERT INTO agg VALUES (?1, 'enforce-2b', 'enforce', 'img-src', 'data', '/', 'none', 1)");
  for (const d of days) ins.run(d);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => db.prepare(sql).run(...args),
    first: async () => ({ ...db.prepare(sql).get(...args) }),
  });
  return { prepare: (sql) => stmt(sql), days: () => db.prepare('SELECT day FROM agg ORDER BY day').all().map((r) => r.day) };
}

const NOW = new Date('2026-11-23T03:17:00Z');
const okFetch = (calls) => async (url) => {
  calls.push(url);
  return new Response('', { status: 200 });
};

test('retention: the cutoff is RETENTION_DAYS before the UTC day', () => {
  assert.equal(RETENTION_DAYS, 30);
  assert.equal(cutoff(NOW), '2026-10-24');
  assert.equal(cutoff(new Date('2026-03-01T23:59:00Z')), '2026-01-30');
});

test('retention: a 31-day-old row goes, the newest stays, both stores, then one success push', async () => {
  const env = {
    PREVIEW_DB: d1(['2026-10-23', '2026-10-24', '2026-11-23']),
    PROD_DB: d1(['2026-09-01', '2026-11-22']),
    KUMA_PUSH_URL: 'https://kuma.example/api/push/abc?status=up',
  };
  const calls = [];
  const r = await runRetention(env, { now: NOW, fetcher: okFetch(calls) });
  assert.equal(r.keepFrom, '2026-10-24');
  assert.deepEqual(env.PREVIEW_DB.days(), ['2026-10-24', '2026-11-23']);
  assert.deepEqual(env.PROD_DB.days(), ['2026-11-22']);
  assert.equal(calls.length, 1);
  const push = new URL(calls[0]);
  assert.equal(push.searchParams.get('status'), 'up');
  assert.match(push.searchParams.get('msg'), /preview 2 rows, prod 1 rows/);
});

test('retention: no success push unless both stores succeed and the push is accepted', async () => {
  const calls = [];
  await assert.rejects(() => runRetention({ PROD_DB: d1([]), KUMA_PUSH_URL: 'https://k/x' }, { now: NOW, fetcher: okFetch(calls) }), /PREVIEW_DB is missing/);
  const broken = { prepare: () => ({ bind: () => ({ run: async () => { throw new Error('D1 down'); } }) }) };
  await assert.rejects(() => runRetention({ PREVIEW_DB: d1([]), PROD_DB: broken, KUMA_PUSH_URL: 'https://k/x' }, { now: NOW, fetcher: okFetch(calls) }), /D1 down/);
  const stale = { prepare: (sql) => ({ bind: () => ({ run: async () => {} }), first: async () => ({ oldest: '2026-01-01', rows: 1 }) }) };
  await assert.rejects(() => runRetention({ PREVIEW_DB: d1([]), PROD_DB: stale, KUMA_PUSH_URL: 'https://k/x' }, { now: NOW, fetcher: okFetch(calls) }), /older than/);
  await assert.rejects(() => runRetention({ PREVIEW_DB: d1([]), PROD_DB: d1([]) }, { now: NOW, fetcher: okFetch(calls) }), /KUMA_PUSH_URL/);
  assert.equal(calls.length, 0, 'no push after any failure');
  await assert.rejects(() => runRetention({ PREVIEW_DB: d1([]), PROD_DB: d1([]), KUMA_PUSH_URL: 'https://k/x' },
    { now: NOW, fetcher: async () => new Response('', { status: 404 }) }), /Kuma push returned 404/);
});

test('retention: wrangler.toml binds both databases, runs daily, has no route and no secret', () => {
  const toml = fs.readFileSync(path.join(root, 'workers/csp-retention/wrangler.toml'), 'utf8');
  assert.match(toml, /binding = "PREVIEW_DB"\ndatabase_name = "csp-reports-preview"/);
  assert.match(toml, /binding = "PROD_DB"\ndatabase_name = "csp-reports-prod"/);
  assert.match(toml, /crons = \["17 3 \* \* \*"\]/);
  assert.match(toml, /workers_dev = false/);
  assert.doesNotMatch(toml, /routes?\s*=|KUMA_PUSH_URL\s*=/);
});

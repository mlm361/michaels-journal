// JOURNAL-CSP-01: the retention Worker against D1 stand-ins on node:sqlite. The stand-in's
// batch() runs its statements in one transaction (rollback on error), like D1's batch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import worker, { RETENTION_DAYS, cutoff, runRetention } from '../workers/csp-retention/index.js';

const root = path.resolve(import.meta.dirname, '..');
const SCHEMA = fs.readFileSync(path.join(root, 'csp/d1-schema.sql'), 'utf8');
const STATUS_SQL = fs.readFileSync(path.join(root, 'csp/d1-prod-retention-status.sql'), 'utf8');

function d1(days, { prod = false } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  if (prod) db.exec(STATUS_SQL);
  const ins = db.prepare("INSERT INTO agg VALUES (?1, 'enforce-2b', 'enforce', 'img-src', 'data', '/', 'none', 1)");
  for (const d of days) ins.run(d);
  const exec = (sql, args) => {
    const st = db.prepare(sql);
    if (/^\s*SELECT/i.test(sql)) return { success: true, results: st.all(...args).map((r) => ({ ...r })), meta: {} };
    const r = st.run(...args);
    return { success: true, results: [], meta: { changes: Number(r.changes) } };
  };
  const stmt = (sql, args = []) => ({ sql, args, bind: (...a) => stmt(sql, a), run: async () => exec(sql, args) });
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => exec(s.sql, s.args));
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    days: () => db.prepare('SELECT day FROM agg ORDER BY day').all().map((r) => r.day),
    status: () => {
      const r = db.prepare('SELECT * FROM retention_status').all();
      return r.length ? { ...r[0] } : null;
    },
  };
}

// Wrap a working stand-in and change exactly one batch result (or throw), to model D1 failures.
function tamper(base, fn) {
  return { ...base, batch: async (stmts) => fn(await base.batch(stmts)) };
}

const NOW = new Date('2026-11-23T03:17:00Z');
const SCHED = new Date('2026-11-23T03:17:00Z');
const PRIOR = {
  id: 1, last_ok_at: '2026-11-22T03:17:04.000Z', scheduled_at: '2026-11-22T03:17:00.000Z', cron: '17 3 * * *',
  keep_from: '2026-10-23', preview_rows: 5, prod_rows: 7, preview_deleted: 0, prod_deleted: 0,
};
function withPrior(store) {
  store.raw.prepare('INSERT INTO retention_status VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...Object.values(PRIOR));
  return store;
}

test('retention: the cutoff is RETENTION_DAYS before the UTC day', () => {
  assert.equal(RETENTION_DAYS, 30);
  assert.equal(cutoff(NOW), '2026-10-24');
  assert.equal(cutoff(new Date('2026-03-01T23:59:00Z')), '2026-01-30');
});

test('retention: prunes both stores, keeps newer rows, then stamps prod with this scheduled run', async () => {
  const env = { PREVIEW_DB: d1(['2026-10-23', '2026-10-24', '2026-11-23']), PROD_DB: withPrior(d1(['2026-09-01', '2026-11-22'], { prod: true })) };
  const r = await runRetention(env, { now: NOW, scheduledTime: SCHED, cron: '17 3 * * *' });
  assert.equal(r.keepFrom, '2026-10-24');
  assert.deepEqual(env.PREVIEW_DB.days(), ['2026-10-24', '2026-11-23']);
  assert.deepEqual(env.PROD_DB.days(), ['2026-11-22']);
  const s = env.PROD_DB.status();
  assert.equal(s.scheduled_at, '2026-11-23T03:17:00.000Z');
  assert.equal(s.cron, '17 3 * * *');
  assert.equal(s.keep_from, '2026-10-24');
  assert.deepEqual([s.preview_rows, s.prod_rows, s.preview_deleted, s.prod_deleted], [2, 1, 1, 1]);
  assert.ok(Date.parse(s.last_ok_at) > Date.parse(PRIOR.last_ok_at));
});

test('retention: with nothing expired, the stamp still proves this run (scheduled_at, zero deletes)', async () => {
  const env = { PREVIEW_DB: d1(['2026-11-20']), PROD_DB: d1(['2026-11-21'], { prod: true }) };
  await runRetention(env, { now: NOW, scheduledTime: SCHED, cron: '17 3 * * *' });
  const s = env.PROD_DB.status();
  assert.equal(s.scheduled_at, SCHED.toISOString());
  assert.deepEqual([s.preview_rows, s.prod_rows, s.preview_deleted, s.prod_deleted], [1, 1, 0, 0]);
});

const failures = {
  'prod batch throws': (env) => { env.PROD_DB = tamper(env.PROD_DB, () => { throw new Error('D1 down'); }); },
  'preview batch throws': (env) => { env.PREVIEW_DB = tamper(env.PREVIEW_DB, () => { throw new Error('D1 down'); }); },
  'prod delete reports failure': (env) => { env.PROD_DB = tamper(env.PROD_DB, (o) => [o[0], { ...o[1], success: false }, o[2]]); },
  'preview pre-count reports failure': (env) => { env.PREVIEW_DB = tamper(env.PREVIEW_DB, (o) => [{ ...o[0], success: false }, o[1], o[2]]); },
  'prod post-check still sees an old row': (env) => { env.PROD_DB = tamper(env.PROD_DB, (o) => [o[0], o[1], { ...o[2], results: [{ oldest: '2026-01-01', n: o[2].results[0].n }] }]); },
  'preview lost a row it should keep': (env) => { env.PREVIEW_DB = tamper(env.PREVIEW_DB, (o) => [o[0], o[1], { ...o[2], results: [{ oldest: o[2].results[0].oldest, n: o[2].results[0].n - 1 }] }]); },
  'prod batch returns a short array': (env) => { env.PROD_DB = tamper(env.PROD_DB, (o) => o.slice(0, 2)); },
  'preview post-check count malformed': (env) => { env.PREVIEW_DB = tamper(env.PREVIEW_DB, (o) => [o[0], o[1], { ...o[2], results: [{ oldest: null, n: 'x' }] }]); },
  'prod counts impossible but equal (-1)': (env) => { env.PROD_DB = tamper(env.PROD_DB, (o) => [{ ...o[0], results: [{ n: -1 }] }, o[1], { ...o[2], results: [{ oldest: null, n: -1 }] }]); },
};

for (const [name, apply] of Object.entries(failures)) {
  test(`retention: ${name} -> run throws and the previous stamp stays intact`, async () => {
    const prod = withPrior(d1(['2026-09-01', '2026-11-22'], { prod: true }));
    const env = { PREVIEW_DB: d1(['2026-10-01', '2026-11-23']), PROD_DB: prod };
    apply(env);
    await assert.rejects(() => runRetention(env, { now: NOW, scheduledTime: SCHED, cron: '17 3 * * *' }));
    assert.deepEqual(prod.status(), PRIOR);
  });
}

test('retention: a missing binding or a failed stamp write fails the run', async () => {
  await assert.rejects(() => runRetention({ PROD_DB: d1([], { prod: true }) }, { now: NOW }), /PREVIEW_DB is missing/);
  await assert.rejects(() => runRetention({ PREVIEW_DB: d1([]) }, { now: NOW }), /PROD_DB is missing/);
  // Prod without the table: both prunes succeed, then the stamp write fails, so the run fails.
  await assert.rejects(() => runRetention({ PREVIEW_DB: d1([]), PROD_DB: d1([]) }, { now: NOW }), /no such table/);
  const prod = withPrior(d1([], { prod: true }));
  const refusing = { ...prod, prepare: (sql) => (/retention_status/.test(sql)
    ? { bind: () => ({ run: async () => ({ success: false, meta: {} }) }) } : prod.prepare(sql)) };
  await assert.rejects(() => runRetention({ PREVIEW_DB: d1([]), PROD_DB: refusing }, { now: NOW }), /status stamp did not succeed/);
  assert.deepEqual(prod.status(), PRIOR);
  const noop = { ...prod, prepare: (sql) => (/retention_status/.test(sql)
    ? { bind: () => ({ run: async () => ({ success: true, meta: { changes: 0 } }) }) } : prod.prepare(sql)) };
  await assert.rejects(() => runRetention({ PREVIEW_DB: d1([]), PROD_DB: noop }, { now: NOW }), /status stamp changed no row/);
});

test('retention: scheduled() passes the controller time and cron, and rethrows failures', async () => {
  const env = { PREVIEW_DB: d1([]), PROD_DB: d1([], { prod: true }) };
  let pending;
  const ctx = { waitUntil: (p) => { pending = p; } };
  const logs = [];
  const orig = console.log;
  console.log = (m) => logs.push(m);
  try {
    await worker.scheduled({ scheduledTime: SCHED.getTime(), cron: '17 3 * * *' }, env, ctx);
    await pending;
  } finally {
    console.log = orig;
  }
  assert.equal(env.PROD_DB.status().scheduled_at, SCHED.toISOString());
  assert.match(logs[0], /^csp-retention ok: scheduled 2026-11-23T03:17:00\.000Z kept from /);
  const errs = [];
  const origErr = console.error;
  console.error = (m) => errs.push(m);
  try {
    await worker.scheduled({ scheduledTime: SCHED.getTime(), cron: '17 3 * * *' }, { PREVIEW_DB: d1([]) }, ctx);
    await assert.rejects(pending, /PROD_DB is missing/);
  } finally {
    console.error = origErr;
  }
  assert.match(errs[0], /^csp-retention failed: scheduled 2026-11-23T03:17:00\.000Z: binding PROD_DB is missing/);
});

test('retention: the Worker makes no outbound calls and reads no push secret', () => {
  const src = fs.readFileSync(path.join(root, 'workers/csp-retention/index.js'), 'utf8');
  assert.doesNotMatch(src, /\bfetch\s*\(|KUMA_PUSH_URL\s*[\]),.]|env\.KUMA/);
});

test('retention: the prod status migration is additive and idempotent', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  db.prepare("INSERT INTO agg VALUES ('2026-11-01', 'p', 'enforce', 'img-src', 'data', '/', 'none', 3)").run();
  db.exec(STATUS_SQL);
  db.exec(STATUS_SQL);
  assert.equal(db.prepare('SELECT count(*) AS n FROM agg').get().n, 1);
  const cols = db.prepare('PRAGMA table_info(retention_status)').all().map((c) => c.name);
  assert.deepEqual(cols, ['id', 'last_ok_at', 'scheduled_at', 'cron', 'keep_from', 'preview_rows', 'prod_rows', 'preview_deleted', 'prod_deleted']);
  assert.match(STATUS_SQL, /CREATE TABLE IF NOT EXISTS retention_status/);
  assert.doesNotMatch(STATUS_SQL, /\b(DROP|DELETE|ALTER|UPDATE|INSERT)\b/i);
  assert.throws(() => db.prepare("INSERT INTO retention_status VALUES (2, 'a', 'b', 'c', 'd', 0, 0, 0, 0)").run(), /CHECK/);
});

test('retention: wrangler.toml binds both databases, runs daily, has no route and no secret', () => {
  const toml = fs.readFileSync(path.join(root, 'workers/csp-retention/wrangler.toml'), 'utf8');
  assert.match(toml, /binding = "PREVIEW_DB"\ndatabase_name = "csp-reports-preview"/);
  assert.match(toml, /binding = "PROD_DB"\ndatabase_name = "csp-reports-prod"/);
  assert.match(toml, /crons = \["17 3 \* \* \*"\]/);
  assert.match(toml, /workers_dev = false/);
  assert.doesNotMatch(toml, /routes?\s*=|KUMA_PUSH_URL/);
});

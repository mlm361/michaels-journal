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
  const stmt = (sql, args = []) => ({ sql, args, bind: (...a) => stmt(sql, a), run: async () => exec(sql, args), all: async () => exec(sql, args) });
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
  const r = await runRetention(env, { scheduledTime: SCHED, cron: '17 3 * * *' });
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
  await runRetention(env, { scheduledTime: SCHED, cron: '17 3 * * *' });
  const s = env.PROD_DB.status();
  assert.equal(s.scheduled_at, SCHED.toISOString());
  assert.deepEqual([s.preview_rows, s.prod_rows, s.preview_deleted, s.prod_deleted], [1, 1, 0, 0]);
});

// Replace one field of one prune-batch result. Stamp batches (2 statements) pass through untouched.
const pre = (f) => (o) => (o.length === 3 ? [{ ...o[0], results: [{ ...o[0].results[0], ...f }] }, o[1], o[2]] : o);
const post = (f) => (o) => (o.length === 3 ? [o[0], o[1], { ...o[2], results: [{ ...o[2].results[0], ...f }] }] : o);
const del = (meta) => (o) => (o.length === 3 ? [o[0], { ...o[1], meta }, o[2]] : o);
const both = (f, g) => (o) => g(f(o));

const failures = {
  'prod batch throws': ['PROD_DB', () => { throw new Error('D1 down'); }],
  'preview batch throws': ['PREVIEW_DB', () => { throw new Error('D1 down'); }],
  'prod delete reports failure': ['PROD_DB', (o) => [o[0], { ...o[1], success: false }, o[2]]],
  'preview pre-count reports failure': ['PREVIEW_DB', (o) => [{ ...o[0], success: false }, o[1], o[2]]],
  'prod post-check reports failure': ['PROD_DB', (o) => [o[0], o[1], { ...o[2], success: false }]],
  'prod post-check still sees an old row': ['PROD_DB', post({ oldest: '2026-01-01' })],
  'preview lost a row it should keep': ['PREVIEW_DB', (o) => post({ n: o[2].results[0].n - 1 })(o)],
  'prod batch returns a short array': ['PROD_DB', (o) => o.slice(0, 2)],
  'preview post-check count is a string': ['PREVIEW_DB', post({ n: 'x' })],
  'prod counts impossible but equal (-1)': ['PROD_DB', both(pre({ n: -1 }), post({ n: -1 }))],
  'prod counts both null': ['PROD_DB', both(pre({ n: null }), post({ n: null, oldest: null }))],
  "preview counts both ''": ['PREVIEW_DB', both(pre({ n: '' }), post({ n: '', oldest: null }))],
  'prod counts both false': ['PROD_DB', both(pre({ n: false }), post({ n: false, oldest: null }))],
  'prod counts both numeric strings': ['PROD_DB', (o) => both(pre({ n: String(o[0].results[0].n) }), post({ n: String(o[2].results[0].n) }))(o)],
  'prod counts missing': ['PROD_DB', (o) => [{ ...o[0], results: [{}] }, o[1], { ...o[2], results: [{}] }]],
  'prod pre-count has no row': ['PROD_DB', (o) => [{ ...o[0], results: [] }, o[1], o[2]]],
  'prod nonempty store with no oldest day': ['PROD_DB', post({ oldest: undefined })],
  'prod nonempty store with a null oldest day': ['PROD_DB', post({ oldest: null })],
  'preview oldest day is not a date': ['PREVIEW_DB', post({ oldest: 'zzzz' })],
  'preview empty store claims an oldest day': ['PREVIEW_DB', (o) => both(pre({ n: 0 }), post({ n: 0, oldest: '2026-11-23' }))(o)],
  'prod delete count missing': ['PROD_DB', del({})],
  'prod delete count is a string': ['PROD_DB', del({ changes: '1' })],
  'preview delete meta absent': ['PREVIEW_DB', del(undefined)],
};

for (const [name, [store, fn]] of Object.entries(failures)) {
  test(`retention: ${name} -> run throws and the previous stamp stays intact`, async () => {
    const prod = withPrior(d1(['2026-09-01', '2026-11-22'], { prod: true }));
    const env = { PREVIEW_DB: d1(['2026-10-01', '2026-11-23']), PROD_DB: prod };
    env[store] = tamper(env[store], fn);
    await assert.rejects(() => runRetention(env, { scheduledTime: SCHED, cron: '17 3 * * *' }));
    assert.deepEqual(prod.status(), PRIOR);
  });
}

test('retention: a kept row that vanished during the prune fails the run (valid oldest day)', async () => {
  const prod = withPrior(d1(['2026-09-01', '2026-11-01', '2026-11-10', '2026-11-22'], { prod: true }));
  const env = { PREVIEW_DB: d1([]), PROD_DB: tamper(prod, (o) => post({ n: o[2].results[0].n - 1 })(o)) };
  await assert.rejects(() => runRetention(env, { scheduledTime: SCHED, cron: '17 3 * * *' }), /expected 3 rows to survive, found 2/);
  assert.deepEqual(prod.status(), PRIOR);
});

// The stamp batch is [forward-only upsert, read-back SELECT]. These fakes answer it WITHOUT executing,
// so the fresh re-read finds the previous stamp, and the error says so (it does not assume it).
function fakeStamp(prod, answer) {
  return { ...prod, batch: async (stmts) => (stmts.length === 2 ? answer(stmts) : prod.batch(stmts)) };
}
const stampFailures = {
  'insert reports failure': [/status stamp did not succeed/, () => [{ success: false, meta: { changes: 1 } }, { success: true, results: [] }]],
  'insert changed no row': [/status stamp changed no row/, () => [{ success: true, meta: { changes: 0 } }, { success: true, results: [] }]],
  'insert changes missing': [/status stamp changes is not a count/, () => [{ success: true, meta: {} }, { success: true, results: [] }]],
  'insert changes is a string': [/status stamp changes is not a count/, () => [{ success: true, meta: { changes: '1' } }, { success: true, results: [] }]],
  'read-back reports failure': [/status read-back did not succeed/, () => [{ success: true, meta: { changes: 1 } }, { success: false, results: [] }]],
  'read-back has no row': [/status read-back returned no row/, () => [{ success: true, meta: { changes: 1 } }, { success: true, results: [] }]],
  'read-back differs': [/status read-back differs at scheduled_at/, (st) => [{ success: true, meta: { changes: 1 } },
    { success: true, results: [{ ...Object.fromEntries(st[1].sql.match(/SELECT (.*) FROM/)[1].split(', ').map((c, i) => [c, st[0].args[i]])), scheduled_at: 'x' }] }]],
  'short stamp batch': [/unexpected shape/, () => [{ success: true, meta: { changes: 1 } }]],
};
for (const [name, [re, answer]] of Object.entries(stampFailures)) {
  test(`retention: stamp ${name} (not executed) -> not confirmed, re-read reports the previous stamp`, async () => {
    const prod = withPrior(d1([], { prod: true }));
    await assert.rejects(() => runRetention({ PREVIEW_DB: d1([]), PROD_DB: fakeStamp(prod, answer) }, { scheduledTime: SCHED, cron: '17 3 * * *' }), re);
    await assert.rejects(() => runRetention({ PREVIEW_DB: d1([]), PROD_DB: fakeStamp(prod, answer) }, { scheduledTime: SCHED, cron: '17 3 * * *' }),
      /^Error: status stamp not confirmed \(.*\); re-read found scheduled_at 2026-11-22T03:17:00\.000Z, last_ok_at 2026-11-22T03:17:04\.000Z$/);
    assert.deepEqual(prod.status(), PRIOR);
  });
}

// Sally R2 P1: real transactions on the stand-in, not synthetic replies.
// Runs the REAL stamp batch (it commits), then replaces or drops D1's reply.
function committedThen(prod, reply, { rereadFails = false } = {}) {
  return {
    ...prod,
    prepare: rereadFails ? (sql) => {
      const st = prod.prepare(sql);
      return { ...st, bind: (...a) => ({ ...st.bind(...a), all: async () => { throw new Error('D1 unavailable'); } }) };
    } : prod.prepare,
    batch: async (stmts) => {
      if (stmts.length !== 2) return prod.batch(stmts);
      const out = await prod.batch(stmts.map((st) => prod.prepare(st.sql).bind(...st.args)));
      return reply(out);
    },
  };
}
const ours = (prod) => prod.status().scheduled_at === SCHED.toISOString();

test('retention: an invalid stamp is rolled back by the table CHECKs; the re-read reports the previous stamp', async () => {
  for (const [cron, sched] of [['', SCHED], ['17 3 * * *', new Date('2099-01-01T03:17:00Z')]]) {
    const prod = withPrior(d1([], { prod: true }));
    await assert.rejects(() => runRetention({ PREVIEW_DB: d1([]), PROD_DB: prod }, { scheduledTime: sched, cron }),
      /^Error: status stamp not confirmed \(status stamp batch failed: CHECK constraint failed: .*\); re-read found scheduled_at 2026-11-22T03:17:00\.000Z/);
    assert.deepEqual(prod.status(), PRIOR);
  }
});

const lostReplies = {
  'the reply is lost (batch throws after commit)': () => { throw new Error('Network connection lost'); },
  'the read-back reply has no row': (o) => [o[0], { ...o[1], results: [] }],
  'the reply is malformed': () => ({}),
  'the reply reports no change': (o) => [{ ...o[0], meta: { changes: 0 } }, o[1]],
};
for (const [name, reply] of Object.entries(lostReplies)) {
  test(`retention: stamp committed but ${name} -> a fresh re-read confirms this run`, async () => {
    const prod = withPrior(d1([], { prod: true }));
    const r = await runRetention({ PREVIEW_DB: d1([]), PROD_DB: committedThen(prod, reply) }, { scheduledTime: SCHED, cron: '17 3 * * *' });
    assert.equal(r.outcome, 'stamped (confirmed by re-read)');
    assert.deepEqual({ ...prod.status(), id: undefined }, { ...r.stamp, id: undefined });
  });
  test(`retention: stamp committed, ${name} and the re-read fails -> outcome unknown, and the row DID advance`, async () => {
    const prod = withPrior(d1([], { prod: true }));
    await assert.rejects(() => runRetention({ PREVIEW_DB: d1([]), PROD_DB: committedThen(prod, reply, { rereadFails: true }) }, { scheduledTime: SCHED, cron: '17 3 * * *' }),
      /^Error: status stamp outcome unknown \(.*; D1 unavailable\): the stored receipt may be from this run or an earlier one$/);
    assert.ok(ours(prod), 'the thrown error must not be read as "previous row kept": this one committed');
  });
}

test('retention: a late, older invocation keeps the newer receipt (real upsert guard, no change)', async () => {
  const prod = d1([], { prod: true });
  const NEWER = { ...PRIOR, last_ok_at: '2026-11-24T03:17:05.000Z', scheduled_at: '2026-11-24T03:17:00.000Z', keep_from: '2026-10-25' };
  prod.raw.prepare('INSERT INTO retention_status VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...Object.values(NEWER));
  let changes;
  const watched = committedThen(prod, (o) => { changes = o[0].meta.changes; return o; });
  const r = await runRetention({ PREVIEW_DB: d1([]), PROD_DB: watched }, { scheduledTime: SCHED, cron: '17 3 * * *' });
  assert.equal(changes, 0);
  assert.equal(r.outcome, 'newer receipt kept (scheduled_at 2026-11-24T03:17:00.000Z, last_ok_at 2026-11-24T03:17:05.000Z)');
  assert.deepEqual(prod.status(), NEWER);
});

test('retention: a re-run of the same scheduled time moves the receipt forward, an identical one does not', async () => {
  const prod = withPrior(d1([], { prod: true }));
  const first = await runRetention({ PREVIEW_DB: d1([]), PROD_DB: prod }, { scheduledTime: SCHED, cron: '17 3 * * *' });
  await new Promise((res) => setTimeout(res, 5));
  const second = await runRetention({ PREVIEW_DB: d1([]), PROD_DB: prod }, { scheduledTime: SCHED, cron: '17 3 * * *' });
  assert.equal(first.outcome, 'stamped');
  assert.equal(second.outcome, 'stamped');
  assert.equal(prod.status().last_ok_at, second.stamp.last_ok_at);
});

test('retention: a missing binding, a missing prod table or a bad scheduled time fails the run', async () => {
  await assert.rejects(() => runRetention({ PROD_DB: d1([], { prod: true }) }, { scheduledTime: SCHED }), /PREVIEW_DB is missing/);
  await assert.rejects(() => runRetention({ PREVIEW_DB: d1([]) }, { scheduledTime: SCHED }), /PROD_DB is missing/);
  await assert.rejects(() => runRetention({ PREVIEW_DB: d1([]), PROD_DB: d1([]) }, { scheduledTime: SCHED }), /no such table/);
  await assert.rejects(() => runRetention({ PREVIEW_DB: d1([]), PROD_DB: d1([], { prod: true }) }, { scheduledTime: 'nope' }), /scheduled time is invalid/);
});

test('retention: the cutoff follows the scheduled time, not the wall clock', async () => {
  const env = { PREVIEW_DB: d1([]), PROD_DB: d1([], { prod: true }) };
  const r = await runRetention(env, { scheduledTime: new Date('2026-03-01T03:17:00Z'), cron: '17 3 * * *' });
  assert.equal(r.keepFrom, '2026-01-30');
  assert.equal(env.PROD_DB.status().keep_from, '2026-01-30');
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
  const ok = ['2026-11-23T03:17:04.000Z', '2026-11-23T03:17:00.000Z', '17 3 * * *', '2026-10-24', 5, 7, 0, 1];
  const bad = {
    'impossible date': { 0: '2026-02-30T03:17:04.000Z', 1: '2026-02-30T03:17:00.000Z', 3: '2026-01-31' },
    'not toISOString form': { 1: '2026-11-23 03:17:00' },
    'keep_from off by a day': { 3: '2026-10-23' },
    'completed before scheduled': { 0: '2026-11-23T03:16:59.000Z' },
    'empty cron': { 2: '' },
    'fractional count': { 4: 5.5 },
    'negative count': { 7: -1 },
    'non-numeric text count': { 5: 'seven' },
  };
  const put = (v) => { db.exec('DELETE FROM retention_status'); db.prepare('INSERT INTO retention_status VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)').run(...v); };
  for (const [name, patch] of Object.entries(bad)) {
    assert.throws(() => put(ok.map((v, i) => (i in patch ? patch[i] : v))), /CHECK constraint failed/, name);
  }
  put(ok);
  assert.equal(db.prepare('SELECT count(*) AS n FROM retention_status').get().n, 1);
});

test('retention: wrangler.toml binds both databases, runs daily, has no route and no secret', () => {
  const toml = fs.readFileSync(path.join(root, 'workers/csp-retention/wrangler.toml'), 'utf8');
  assert.match(toml, /binding = "PREVIEW_DB"\ndatabase_name = "csp-reports-preview"/);
  assert.match(toml, /binding = "PROD_DB"\ndatabase_name = "csp-reports-prod"/);
  assert.match(toml, /crons = \["17 3 \* \* \*"\]/);
  assert.match(toml, /workers_dev = false/);
  assert.doesNotMatch(toml, /routes?\s*=|KUMA_PUSH_URL/);
});

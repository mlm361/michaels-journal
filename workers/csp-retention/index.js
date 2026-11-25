// JOURNAL-CSP-01: daily retention for the CSP report aggregates (Sally v4 amendment 1; Phase 2
// close-out, plan michaelreflects-csp-phase2c-plan-v2 Part 1).
//
// A Cloudflare Worker with a daily UTC Cron Trigger, bound to BOTH collector databases. For each
// store it runs one D1 batch (a single transaction): count the rows to keep, delete older rows,
// then re-read. It checks every statement's outcome against D1's numeric result contract, that
// nothing older than the cutoff remains and that exactly the rows to keep survived. Only after BOTH
// stores pass does it stamp `retention_status` (one row) on PROD_DB with this execution's
// scheduled time and cron. Uptime Kuma is LAN-only, so the Worker makes no outbound calls: a pi5
// poller reads the stamp and pushes to Kuma.
//
// What a failure means for the stored receipt (Sally R2 P1):
// - A prune failure throws BEFORE any stamp write, so the previous receipt is untouched.
// - The stamp is an upsert that only moves the receipt forward ((scheduled_at, last_ok_at) newer),
//   and the table's CHECKs validate every stored column inside the same transaction, so a bad
//   stamp rolls back. If D1's reply is missing, malformed or disagrees, the outcome is UNCERTAIN
//   (the batch may have committed): a fresh read then decides. This run's exact receipt stored ->
//   success; a newer receipt stored -> success, left in place (a late older invocation); anything
//   else -> throw with what IS stored. A thrown stamp error never means "the previous row is still
//   there"; the message says what the fresh read found, or that it could not read at all.

// Bindings (wrangler.toml): PREVIEW_DB -> csp-reports-preview, PROD_DB -> csp-reports-prod.
// Prod table: csp/d1-prod-retention-status.sql (applied to the live database before this Worker).

export const RETENTION_DAYS = 30; // csp/d1-prod-retention-status.sql CHECK (keep_from) pins 30 too
export const STORES = ['PREVIEW_DB', 'PROD_DB'];

export function cutoff(now = new Date(), days = RETENTION_DAYS) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function checked(result, what) {
  if (!result || result.success !== true) throw new Error(`${what} did not succeed`);
  return result;
}

// D1 returns SQLite INTEGER results and meta.changes as JavaScript numbers. Anything else
// (null, '', false, a numeric string, a missing field) is not verification.
function intOf(value, what) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`${what} is not a count`);
  return value;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function rowOf(result, what) {
  const rows = result.results;
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0] === null || typeof rows[0] !== 'object') {
    throw new Error(`${what} returned no row`);
  }
  return rows[0];
}

export async function pruneOne(db, keepFrom) {
  const out = await db.batch([
    db.prepare('SELECT count(*) AS n FROM agg WHERE day >= ?1').bind(keepFrom),
    db.prepare('DELETE FROM agg WHERE day < ?1').bind(keepFrom),
    db.prepare('SELECT min(day) AS oldest, count(*) AS n FROM agg').bind(),
  ]);
  if (!Array.isArray(out) || out.length !== 3) throw new Error('batch returned an unexpected shape');
  const keep = intOf(rowOf(checked(out[0], 'pre-count'), 'pre-count').n, 'pre-count');
  const deleted = intOf(checked(out[1], 'delete').meta?.changes, 'delete count');
  const after = rowOf(checked(out[2], 'post-check'), 'post-check');
  const rows = intOf(after.n, 'post-check count');
  const oldest = after.oldest;
  if (rows === 0) {
    if (oldest !== null) throw new Error('post-check reports an oldest day for an empty store');
  } else {
    if (typeof oldest !== 'string' || !DAY_RE.test(oldest)) throw new Error('post-check oldest day is not a date');
    if (oldest < keepFrom) throw new Error(`rows older than ${keepFrom} remain`);
  }
  if (rows !== keep) throw new Error(`expected ${keep} rows to survive, found ${rows}`);
  return { oldest, rows, deleted };
}

const STAMP_COLS = ['last_ok_at', 'scheduled_at', 'cron', 'keep_from',
  'preview_rows', 'prod_rows', 'preview_deleted', 'prod_deleted'];
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const STAMP_SQL = `INSERT INTO retention_status (id, ${STAMP_COLS.join(', ')}) `
  + `VALUES (1, ${STAMP_COLS.map((_, i) => `?${i + 1}`).join(', ')}) `
  + `ON CONFLICT(id) DO UPDATE SET ${STAMP_COLS.map((c) => `${c} = excluded.${c}`).join(', ')} `
  + 'WHERE (excluded.scheduled_at, excluded.last_ok_at) > (retention_status.scheduled_at, retention_status.last_ok_at)';
const READ_SQL = `SELECT ${STAMP_COLS.join(', ')} FROM retention_status WHERE id = 1`;

function sameStamp(row, stamp) {
  return row !== null && typeof row === 'object' && STAMP_COLS.every((c) => row[c] === stamp[c]);
}

function isNewer(row, stamp) {
  if (!ISO_RE.test(String(row.scheduled_at)) || !ISO_RE.test(String(row.last_ok_at))) return false;
  return row.scheduled_at > stamp.scheduled_at
    || (row.scheduled_at === stamp.scheduled_at && row.last_ok_at > stamp.last_ok_at);
}

// The batch reply alone proves the stamp only when every part checks out. Returns null when it
// does, otherwise the reason it does not (the write may still have committed).
function replyProblem(out, stamp) {
  try {
    if (!Array.isArray(out) || out.length !== 2) throw new Error('status stamp batch returned an unexpected shape');
    if (intOf(checked(out[0], 'status stamp').meta?.changes, 'status stamp changes') < 1) {
      throw new Error('status stamp changed no row');
    }
    const back = rowOf(checked(out[1], 'status read-back'), 'status read-back');
    for (const c of STAMP_COLS) if (back[c] !== stamp[c]) throw new Error(`status read-back differs at ${c}`);
    return null;
  } catch (e) {
    return e.message;
  }
}

// A fresh read of the stored receipt: the row, or null when the table has none.
async function readStatus(db) {
  const r = checked(await db.prepare(READ_SQL).bind().all(), 'status re-read');
  if (!Array.isArray(r.results) || r.results.length > 1) throw new Error('status re-read returned an unexpected shape');
  return r.results.length ? r.results[0] : null;
}

function describeRow(row) {
  return row ? `scheduled_at ${row.scheduled_at}, last_ok_at ${row.last_ok_at}` : 'no row';
}

export async function stampStatus(db, stamp) {
  let problem;
  try {
    problem = replyProblem(await db.batch([
      db.prepare(STAMP_SQL).bind(...STAMP_COLS.map((c) => stamp[c])),
      db.prepare(READ_SQL).bind(),
    ]), stamp);
  } catch (e) {
    problem = `status stamp batch failed: ${e.message}`;
  }
  if (problem === null) return 'stamped';
  let stored;
  try {
    stored = await readStatus(db);
  } catch (e) {
    throw new Error(`status stamp outcome unknown (${problem}; ${e.message}): `
      + 'the stored receipt may be from this run or an earlier one');
  }
  if (sameStamp(stored, stamp)) return 'stamped (confirmed by re-read)';
  if (stored && isNewer(stored, stamp)) return `newer receipt kept (${describeRow(stored)})`;
  throw new Error(`status stamp not confirmed (${problem}); re-read found ${describeRow(stored)}`);
}

// The cutoff is computed from the run's scheduled time, so keep_from = scheduled UTC day - 30 days
// is checkable from the stamp alone.
export async function runRetention(env, { scheduledTime = new Date(), cron = 'manual' } = {}) {
  const scheduled = new Date(scheduledTime);
  if (Number.isNaN(scheduled.getTime())) throw new Error('scheduled time is invalid');
  const keepFrom = cutoff(scheduled);
  for (const name of STORES) if (!env[name]) throw new Error(`binding ${name} is missing`);
  const results = {};
  for (const name of STORES) results[name] = await pruneOne(env[name], keepFrom);
  const stamp = {
    last_ok_at: new Date().toISOString(), scheduled_at: scheduled.toISOString(), cron: String(cron), keep_from: keepFrom,
    preview_rows: results.PREVIEW_DB.rows, prod_rows: results.PROD_DB.rows,
    preview_deleted: results.PREVIEW_DB.deleted, prod_deleted: results.PROD_DB.deleted,
  };
  const outcome = await stampStatus(env.PROD_DB, stamp);
  return { keepFrom, results, stamp, outcome };
}

export default {
  async scheduled(controller, env, ctx) {
    const scheduledTime = new Date(controller.scheduledTime);
    ctx.waitUntil(runRetention(env, { scheduledTime, cron: controller.cron }).then(
      (r) => console.log(`csp-retention ok: scheduled ${scheduledTime.toISOString()} kept from ${r.keepFrom}; `
        + `preview ${r.results.PREVIEW_DB.rows} rows (-${r.results.PREVIEW_DB.deleted}), `
        + `prod ${r.results.PROD_DB.rows} rows (-${r.results.PROD_DB.deleted}); ${r.outcome}`),
      (e) => {
        console.error(`csp-retention failed: scheduled ${scheduledTime.toISOString()}: ${e.message}`);
        throw e;
      },
    ));
  },
};

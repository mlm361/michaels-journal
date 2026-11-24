// JOURNAL-CSP-01: daily retention for the CSP report aggregates (Sally v4 amendment 1; Phase 2
// close-out, plan michaelreflects-csp-phase2c-plan-v2 Part 1).
//
// A Cloudflare Worker with a daily UTC Cron Trigger, bound to BOTH collector databases. For each
// store it runs one D1 batch (a single transaction): count the rows to keep, delete older rows,
// then re-read. It checks every statement's outcome against D1's numeric result contract, that
// nothing older than the cutoff remains and that exactly the rows to keep survived. Only after BOTH
// stores pass does it stamp `retention_status` (one row) on PROD_DB with this execution's
// scheduled time and cron, in a batch that reads the row back and compares every column. A failed run
// throws and leaves the previous stamp untouched, so the stamp ages. Uptime Kuma is LAN-only, so
// the Worker makes no outbound calls: a pi5 poller reads the stamp and pushes to Kuma.
//
// Bindings (wrangler.toml): PREVIEW_DB -> csp-reports-preview, PROD_DB -> csp-reports-prod.
// Prod table: csp/d1-prod-retention-status.sql (applied to the live database before this Worker).

export const RETENTION_DAYS = 30;
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
  const cols = Object.keys(stamp);
  const db = env.PROD_DB;
  const out = await db.batch([
    db.prepare(`INSERT OR REPLACE INTO retention_status (id, ${cols.join(', ')}) `
      + `VALUES (1, ${cols.map((_, i) => `?${i + 1}`).join(', ')})`).bind(...cols.map((c) => stamp[c])),
    db.prepare(`SELECT ${cols.join(', ')} FROM retention_status WHERE id = 1`).bind(),
  ]);
  if (!Array.isArray(out) || out.length !== 2) throw new Error('status stamp batch returned an unexpected shape');
  if (intOf(checked(out[0], 'status stamp').meta?.changes, 'status stamp changes') < 1) {
    throw new Error('status stamp changed no row');
  }
  const back = rowOf(checked(out[1], 'status read-back'), 'status read-back');
  for (const c of cols) if (back[c] !== stamp[c]) throw new Error(`status read-back differs at ${c}`);
  return { keepFrom, results, stamp };
}

export default {
  async scheduled(controller, env, ctx) {
    const scheduledTime = new Date(controller.scheduledTime);
    ctx.waitUntil(runRetention(env, { scheduledTime, cron: controller.cron }).then(
      (r) => console.log(`csp-retention ok: scheduled ${scheduledTime.toISOString()} kept from ${r.keepFrom}; `
        + `preview ${r.results.PREVIEW_DB.rows} rows (-${r.results.PREVIEW_DB.deleted}), `
        + `prod ${r.results.PROD_DB.rows} rows (-${r.results.PROD_DB.deleted})`),
      (e) => {
        console.error(`csp-retention failed: scheduled ${scheduledTime.toISOString()}: ${e.message}`);
        throw e;
      },
    ));
  },
};

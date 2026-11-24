// JOURNAL-CSP-01: daily retention for the CSP report aggregates (Sally v4 amendment 1; Phase 2
// close-out, plan michaelreflects-csp-phase2c-plan-v2 Part 1).
//
// A Cloudflare Worker with a daily UTC Cron Trigger, bound to BOTH collector databases. For each
// store it runs one D1 batch (a single transaction): count the rows to keep, delete older rows,
// then re-read. It checks every statement's outcome, that nothing older than the cutoff remains
// and that exactly the rows to keep survived. Only after BOTH stores pass does it stamp
// `retention_status` (one row) on PROD_DB with this execution's scheduled time. A failed run
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

function intOf(value, what) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${what} is not a count`);
  return n;
}

export async function pruneOne(db, keepFrom) {
  const out = await db.batch([
    db.prepare('SELECT count(*) AS n FROM agg WHERE day >= ?1').bind(keepFrom),
    db.prepare('DELETE FROM agg WHERE day < ?1').bind(keepFrom),
    db.prepare('SELECT min(day) AS oldest, count(*) AS n FROM agg').bind(),
  ]);
  if (!Array.isArray(out) || out.length !== 3) throw new Error('batch returned an unexpected shape');
  const before = checked(out[0], 'pre-count').results?.[0];
  const deleted = checked(out[1], 'delete').meta?.changes;
  const after = checked(out[2], 'post-check').results?.[0];
  const keep = intOf(before?.n, 'pre-count');
  const rows = intOf(after?.n, 'post-check count');
  const oldest = after?.oldest ?? null;
  if (oldest !== null && oldest < keepFrom) throw new Error(`rows older than ${keepFrom} remain`);
  if (rows !== keep) throw new Error(`expected ${keep} rows to survive, found ${rows}`);
  return { oldest, rows, deleted: intOf(deleted ?? 0, 'delete count') };
}

export async function runRetention(env, { now = new Date(), scheduledTime = now, cron = 'manual' } = {}) {
  const keepFrom = cutoff(now);
  for (const name of STORES) if (!env[name]) throw new Error(`binding ${name} is missing`);
  const results = {};
  for (const name of STORES) results[name] = await pruneOne(env[name], keepFrom);
  const stamp = await env.PROD_DB.prepare(
    'INSERT OR REPLACE INTO retention_status '
    + '(id, last_ok_at, scheduled_at, cron, keep_from, preview_rows, prod_rows, preview_deleted, prod_deleted) '
    + 'VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)',
  ).bind(
    new Date().toISOString(), new Date(scheduledTime).toISOString(), String(cron), keepFrom,
    results.PREVIEW_DB.rows, results.PROD_DB.rows, results.PREVIEW_DB.deleted, results.PROD_DB.deleted,
  ).run();
  checked(stamp, 'status stamp');
  if (stamp.meta && stamp.meta.changes !== undefined && Number(stamp.meta.changes) < 1) {
    throw new Error('status stamp changed no row');
  }
  return { keepFrom, results };
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

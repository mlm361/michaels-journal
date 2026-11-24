// JOURNAL-CSP-01 Phase 2b: daily retention for the CSP report aggregates (Sally v4 amendment 1).
// A Cloudflare Worker with a daily UTC Cron Trigger, bound to BOTH collector databases. It deletes
// rows older than RETENTION_DAYS, verifies each store afterwards, and sends the Uptime Kuma
// success push only when both databases pruned and verified. A missed or failed run therefore
// alerts on Kuma's own schedule, independent of report traffic. No HTTP route.
//
// Bindings (wrangler.toml): PREVIEW_DB -> csp-reports-preview, PROD_DB -> csp-reports-prod.
// Secret: KUMA_PUSH_URL (the push monitor URL; never logged).

export const RETENTION_DAYS = 30;
export const STORES = ['PREVIEW_DB', 'PROD_DB'];

export function cutoff(now = new Date(), days = RETENTION_DAYS) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function pruneOne(db, keepFrom) {
  await db.prepare('DELETE FROM agg WHERE day < ?1').bind(keepFrom).run();
  const row = await db.prepare('SELECT min(day) AS oldest, count(*) AS rows FROM agg').first();
  const oldest = row?.oldest ?? null;
  if (oldest !== null && oldest < keepFrom) throw new Error(`rows older than ${keepFrom} remain`);
  return { oldest, rows: Number(row?.rows ?? 0) };
}

export async function runRetention(env, { now = new Date(), fetcher = fetch } = {}) {
  const keepFrom = cutoff(now);
  const results = {};
  for (const name of STORES) {
    if (!env[name]) throw new Error(`binding ${name} is missing`);
    results[name] = await pruneOne(env[name], keepFrom);
  }
  if (!env.KUMA_PUSH_URL) throw new Error('KUMA_PUSH_URL is not set');
  const push = new URL(env.KUMA_PUSH_URL);
  push.searchParams.set('status', 'up');
  push.searchParams.set('msg', `pruned before ${keepFrom}; preview ${results.PREVIEW_DB.rows} rows, prod ${results.PROD_DB.rows} rows`);
  const res = await fetcher(push.toString(), { method: 'GET' });
  if (!res.ok) throw new Error(`Kuma push returned ${res.status}`);
  return { keepFrom, results };
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runRetention(env).then(
      (r) => console.log(`csp-retention: kept from ${r.keepFrom}`),
      (e) => {
        console.error(`csp-retention failed: ${e.message}`);
        throw e;
      },
    ));
  },
};

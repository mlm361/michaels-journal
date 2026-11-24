// JOURNAL-CSP-01 Phase 2b: the CSP violation collector (plan v3 D5 + D5b, Sally v4 amendments 2-3).
// Route: functions/api/csp-report.js. Storage: D1 binding CSP_REPORTS, table agg (see plan v3).
//
// What is stored: per UTC day, per policy, a count for a fixed-bucket key. Never a URL, query,
// referrer, user agent, IP, sample text or sample hash. Every value is either a fixed word, a
// host named in the shipped policies, a canonical page path from the build, or an inventory id.
//
// Data from the build (tools/csp-inline-inventory.mjs emit), read through env.ASSETS:
//   /__csp/meta.json      mode, canonical/preview host, the known policies, the policy hosts
//   /__csp/routes.json    every canonical page path
//   /__csp/pos/<key>.json inline code positions for one page

// Each report repeats the whole policy (about 1.3 KB), and Chrome batches a page's reports into
// one POST (about 12 on a normal page). Plan v3 said 16 KB, which fits only about 11 reports;
// 64 KB fits about 45. Records past MAX_RECORDS are dropped, not the request. (Flagged for review.)
export const MAX_BODY = 64 * 1024;
export const MAX_RECORDS = 20;
export const DAILY_KEYS = 500;
export const TYPES = new Set(['application/reports+json', 'application/csp-report']);
export const DIRECTIVES = new Set([
  'script-src-elem', 'script-src-attr', 'style-src-elem', 'style-src-attr', 'img-src', 'connect-src',
  'frame-src', 'media-src', 'font-src', 'worker-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors',
]);
export const KEYWORDS = new Set(['inline', 'eval', 'wasm-eval', 'blob', 'data', 'self']);
// Which disposition each known policy must carry; anything else is dropped.
export const POLICY_DISPOSITION = {
  'enforce-2b': 'enforce', 'ro-phase3': 'report', 'fixture-legacy': 'enforce', 'fixture-modern': 'enforce',
};
export const OVERFLOW = { directive: 'overflow', blocked: 'overflow', page_id: 'overflow', item_id: 'none' };

export function responseHeaders() {
  return {
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  };
}

const reply = (status, extra = {}) => new Response(null, { status, headers: { ...responseHeaders(), ...extra } });
const squash = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

// ---- build data (cached per isolate and deployment) ----
const cache = new Map();
async function asset(env, request, path, fallback) {
  const url = new URL(path, request.url).toString();
  if (cache.has(url)) return cache.get(url);
  let value = fallback;
  try {
    const res = await env.ASSETS.fetch(new Request(url));
    if (res.ok) value = await res.json();
  } catch {
    value = fallback;
  }
  if (cache.size > 200) cache.clear();
  cache.set(url, value);
  return value;
}
export const _clearCache = () => cache.clear();

export async function sha16(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// ---- reading the body (the cap is checked on Content-Length and while reading) ----
export async function readCapped(request, limit = MAX_BODY) {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

// ---- the two wire formats, parsed separately (D5b) ----
// Reporting API: an array of { type: 'csp-violation', body: {...} }.
export function parseModern(json) {
  if (!Array.isArray(json)) return [];
  return json.filter((r) => r && r.type === 'csp-violation' && r.body && typeof r.body === 'object').map((r) => ({
    document: r.body.documentURL,
    directive: r.body.effectiveDirective,
    blocked: r.body.blockedURL,
    policy: r.body.originalPolicy,
    disposition: r.body.disposition,
    line: r.body.lineNumber,
    column: r.body.columnNumber,
  }));
}

// Legacy report-uri: { "csp-report": {...} }.
export function parseLegacy(json) {
  const r = json && typeof json === 'object' && !Array.isArray(json) ? json['csp-report'] : null;
  if (!r || typeof r !== 'object') return [];
  return [{
    document: r['document-uri'],
    directive: r['effective-directive'] || String(r['violated-directive'] || '').split(' ')[0],
    blocked: r['blocked-uri'],
    policy: r['original-policy'],
    disposition: r.disposition,
    line: r['line-number'],
    column: r['column-number'],
  }];
}

// ---- buckets ----
export function policyId(meta, policy) {
  const text = squash(policy);
  for (const [id, value] of Object.entries(meta.policies || {})) if (squash(value) === text) return id;
  return null;
}

export function directiveBucket(value) {
  const d = String(value || '').toLowerCase();
  return DIRECTIVES.has(d) ? d : 'other';
}

function hostMatches(pattern, host) {
  if (pattern.startsWith('*.')) return host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1;
  return pattern === host;
}

export function blockedBucket(value, meta, requestHost) {
  const raw = String(value || '').trim();
  const word = raw.toLowerCase();
  if (KEYWORDS.has(word)) return word;
  if (word === 'data' || word.startsWith('data:')) return 'data';
  if (word === 'blob' || word.startsWith('blob:')) return 'blob';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return 'other-external';
  }
  const host = url.host.toLowerCase();
  if (host === requestHost || host === meta.canonical_host || (meta.preview_host && host === meta.preview_host)) return 'self';
  const named = (meta.hosts || []).find((h) => hostMatches(h, host));
  return named || 'other-external';
}

export function pageBucket(documentUrl, origin, routes) {
  let url;
  try {
    url = new URL(String(documentUrl || ''));
  } catch {
    return 'other';
  }
  if (url.origin !== origin) return 'other';
  return routes.has(url.pathname) ? url.pathname : 'other';
}

// The inventory item an inline violation belongs to, by position (D5b).
export function itemBucket(positions, kind, line, column) {
  const L = Number(line);
  if (!Array.isArray(positions) || !Number.isInteger(L) || L < 1) return 'ambiguous';
  const wanted = kind === 'script-src-attr' ? 'handler:' : null;
  const candidates = positions.filter(([id, start, , end]) => (wanted ? id.startsWith(wanted) : !id.startsWith('handler:')) && start <= L && L <= end);
  if (candidates.length === 1) return candidates[0][0];
  const C = Number(column);
  if (candidates.length > 1 && Number.isInteger(C)) {
    const exact = candidates.filter(([, start, col]) => start === L && col === C);
    if (exact.length === 1) return exact[0][0];
  }
  return 'ambiguous';
}

export function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// One aggregate key per record, or null to drop it.
export async function normalize(record, ctx) {
  const id = policyId(ctx.meta, record.policy);
  if (!id) return null;
  const expected = POLICY_DISPOSITION[id];
  const disposition = record.disposition == null ? expected : String(record.disposition).toLowerCase();
  if (disposition !== expected) return null;
  const directive = directiveBucket(record.directive);
  const blocked = blockedBucket(record.blocked, ctx.meta, ctx.host);
  const page_id = pageBucket(record.document, ctx.origin, ctx.routes);
  let item_id = 'none';
  if (blocked === 'inline' && (directive === 'script-src-elem' || directive === 'script-src-attr')) {
    item_id = page_id === 'other' ? 'ambiguous' : itemBucket(await ctx.positions(page_id), directive, record.line, record.column);
  }
  return { day: ctx.day, policy_id: id, disposition, directive, blocked, page_id, item_id };
}

export const KEY_FIELDS = ['day', 'policy_id', 'disposition', 'directive', 'blocked', 'page_id', 'item_id'];
export function coalesce(keys) {
  const counts = new Map();
  for (const k of keys) {
    const s = JSON.stringify(KEY_FIELDS.map((f) => k[f]));
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  return [...counts].map(([s, n]) => ({ ...Object.fromEntries(KEY_FIELDS.map((f, i) => [f, JSON.parse(s)[i]])), n }));
}

// One statement per key (Sally v4 amendment 3): the key itself if it already exists or the
// day+policy has fewer than DAILY_KEYS ordinary rows; otherwise the reserved overflow row for
// that day+policy. The reserved row is not counted against the cap.
export const UPSERT = `
WITH fits AS (
  SELECT (EXISTS (SELECT 1 FROM agg WHERE day = ?1 AND policy_id = ?2 AND disposition = ?3
                  AND directive = ?4 AND blocked = ?5 AND page_id = ?6 AND item_id = ?7)
          OR (SELECT count(*) FROM agg WHERE day = ?1 AND policy_id = ?2 AND directive <> 'overflow') < ${DAILY_KEYS}) AS ok
)
INSERT INTO agg (day, policy_id, disposition, directive, blocked, page_id, item_id, n)
SELECT ?1, ?2, ?3,
       CASE WHEN ok THEN ?4 ELSE 'overflow' END,
       CASE WHEN ok THEN ?5 ELSE 'overflow' END,
       CASE WHEN ok THEN ?6 ELSE 'overflow' END,
       CASE WHEN ok THEN ?7 ELSE 'none' END,
       ?8
FROM fits WHERE true
ON CONFLICT (day, policy_id, disposition, directive, blocked, page_id, item_id) DO UPDATE SET n = n + excluded.n`;

export function statements(db, rows) {
  return rows.map((r) => db.prepare(UPSERT).bind(r.day, r.policy_id, r.disposition, r.directive, r.blocked, r.page_id, r.item_id, r.n));
}

// May this deployment write at this host? (Sally v4 amendment 2)
export function writeAllowed(meta, host) {
  if (!meta) return false;
  if (meta.mode === 'production') return host === meta.canonical_host;
  if (meta.mode === 'preview') return Boolean(meta.preview_host) && host === meta.preview_host;
  return false;
}

export async function handle(request, env, { now = new Date() } = {}) {
  if (request.method !== 'POST') return reply(405, { Allow: 'POST' });
  const type = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPES.has(type)) return reply(415);
  const text = await readCapped(request);
  if (text === null) return reply(413);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return reply(400);
  }
  const url = new URL(request.url);
  const meta = await asset(env, request, '/__csp/meta.json', null);
  if (!env.CSP_REPORTS || !writeAllowed(meta, url.host)) return reply(204);
  const records = (type === 'application/reports+json' ? parseModern(json) : parseLegacy(json)).slice(0, MAX_RECORDS);
  if (!records.length) return reply(204);
  const routes = new Set(await asset(env, request, '/__csp/routes.json', []));
  const ctx = {
    meta,
    routes,
    host: url.host,
    origin: url.origin,
    day: utcDay(now),
    positions: async (page) => asset(env, request, `/__csp/pos/${await sha16(page)}.json`, null),
  };
  const keys = [];
  for (const r of records) {
    const k = await normalize(r, ctx);
    if (k) keys.push(k);
  }
  if (keys.length) await env.CSP_REPORTS.batch(statements(env.CSP_REPORTS, coalesce(keys)));
  return reply(204);
}

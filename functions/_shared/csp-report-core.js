// JOURNAL-CSP-01 Phase 2b: the CSP violation collector (plan v3 D5 + D5b, Sally v4 amendments 2-3).
// Route: functions/api/csp-report.js. Storage: D1 binding CSP_REPORTS, table agg (see plan v3).
//
// What is stored: per UTC day, per policy, a count for a fixed-bucket key. Never a URL, query,
// referrer, user agent, IP, sample text or sample hash. Every value is either a fixed word, a
// host named in the shipped policies, a canonical page path from the build, or an inventory id.
// An inline handler's sample is hashed in memory only, to pick its inventory id (see itemBucket).
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
// Required build data could not be read: observable (status + one log line naming the file, no
// request data), nothing written, and not cached so the next request tries again.
function unavailable(which, status) {
  console.error(`csp-report: build data unavailable: ${which} (status ${status})`);
  return reply(503, { 'Retry-After': '60' });
}
const squash = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

// ---- build data (cached per isolate and deployment) ----
// Only data that was read and validated is cached. A failed or invalid read is never cached, so a
// transient ASSETS error costs one request, not the isolate (Sally 2b r1 finding 1).
const cache = new Map();
export async function asset(env, request, path, valid) {
  const url = new URL(path, request.url).toString();
  if (cache.has(url)) return { ok: true, value: cache.get(url) };
  let value;
  try {
    const res = await env.ASSETS.fetch(new Request(url));
    if (!res.ok) return { ok: false, status: res.status };
    value = await res.json();
  } catch {
    return { ok: false, status: 0 };
  }
  if (!valid(value)) return { ok: false, status: 0 };
  if (cache.size > 200) cache.clear();
  cache.set(url, value);
  return { ok: true, value };
}
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const validMeta = (m) => isObj(m) && typeof m.mode === 'string' && typeof m.canonical_host === 'string'
  && isObj(m.policies) && Array.isArray(m.hosts);
export const validRoutes = (r) => Array.isArray(r) && r.every((x) => typeof x === 'string');
export const validPositions = (p) => Array.isArray(p) && p.every((x) => Array.isArray(x) && x.length === 4 && typeof x[0] === 'string');
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
    sample: r.body.sample,
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
    sample: r['script-sample'],
  }];
}

// ---- buckets ----
// Firefox reports `original-policy` with report-uri made absolute
// (`report-uri https://<this host>/api/csp-report`). A report-uri value on one of our own hosts is
// compared as its path; any other host stays as written, so it can't match a known policy.
function ownReportUri(text, ownHosts) {
  return text.replace(/(^|;\s*)(report-uri)((?:\s+[^\s;]+)+)/gi, (all, lead, name, list) =>
    lead + name + list.replace(/\S+/g, (token) => {
      try {
        const u = new URL(token);
        return u.protocol === 'https:' && ownHosts.includes(u.host) ? u.pathname : token;
      } catch {
        return token;
      }
    }));
}

export function policyId(meta, policy, requestHost = null) {
  const own = [requestHost, meta.canonical_host, meta.preview_host].filter(Boolean);
  const text = ownReportUri(squash(policy), own);
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

// The inventory item an inline violation belongs to (D5b).
// Handlers first by sample: Chromium reports a handler's violation at 0:0 or at the position of
// whatever script was running, never at the attribute. Inventory handler ids end in 12 hex of the
// attribute value's SHA-256, and the browser's sample is that value (up to 40 characters), so
// `handlerHash` (12 hex of the sample's SHA-256) picks the id when exactly one id on the page has it.
// Longer handlers and anything else fall back to position.
export function itemBucket(positions, kind, line, column, handlerHash = null) {
  if (!Array.isArray(positions)) return 'ambiguous';
  if (kind === 'script-src-attr' && typeof handlerHash === 'string' && /^[0-9a-f]{12}$/.test(handlerHash)) {
    const ids = new Set(positions.map(([id]) => id).filter((id) => id.startsWith('handler:') && id.endsWith(':' + handlerHash)));
    if (ids.size === 1) return [...ids][0];
  }
  const L = Number(line);
  if (!Number.isInteger(L) || L < 1) return 'ambiguous';
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
  const id = policyId(ctx.meta, record.policy, ctx.host);
  if (!id) return null;
  const expected = POLICY_DISPOSITION[id];
  const disposition = record.disposition == null ? expected : String(record.disposition).toLowerCase();
  if (disposition !== expected) return null;
  const directive = directiveBucket(record.directive);
  const blocked = blockedBucket(record.blocked, ctx.meta, ctx.host);
  const page_id = pageBucket(record.document, ctx.origin, ctx.routes);
  let item_id = 'none';
  if (blocked === 'inline' && (directive === 'script-src-elem' || directive === 'script-src-attr')) {
    const handlerHash = directive === 'script-src-attr' && typeof record.sample === 'string' && record.sample
      ? (await sha16(record.sample)).slice(0, 12) : null;
    item_id = page_id === 'other' ? 'ambiguous' : itemBucket(await ctx.positions(page_id), directive, record.line, record.column, handlerHash);
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

// May this deployment write at this host? (Sally v4 amendment 2, 2b r1 finding 2)
// Production: only at the canonical host. Preview: only at the build's own host AND only while the
// preview database's control row names that host. The row lives outside every build, so one UPDATE
// retires every other preview at once, including older hash URLs of the same branch.
export const ACTIVE_PREVIEW_SQL = "SELECT value FROM control WHERE name = 'active_preview_host'";
export function writeAllowed(meta, host, activePreviewHost = null) {
  if (!meta) return false;
  if (meta.mode === 'production') return host === meta.canonical_host;
  if (meta.mode === 'preview') return Boolean(meta.preview_host) && host === meta.preview_host && host === activePreviewHost;
  return false;
}

// Read the preview switch. null = no active preview; throws if the database can't be read.
export async function activePreviewHost(db) {
  const row = await db.prepare(ACTIVE_PREVIEW_SQL).first();
  return row && typeof row.value === 'string' && row.value ? row.value : null;
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
  // Required build data: if it can't be read, say so (503) and write nothing; the next request retries.
  const metaRead = await asset(env, request, '/__csp/meta.json', validMeta);
  if (!metaRead.ok) return unavailable('meta', metaRead.status);
  const meta = metaRead.value;
  if (!env.CSP_REPORTS) return reply(204);
  let active = null;
  if (meta.mode === 'preview' && meta.preview_host === url.host) {
    try {
      active = await activePreviewHost(env.CSP_REPORTS);
    } catch {
      return unavailable('preview switch', 0);
    }
  }
  if (!writeAllowed(meta, url.host, active)) return reply(204);
  const records = (type === 'application/reports+json' ? parseModern(json) : parseLegacy(json)).slice(0, MAX_RECORDS);
  if (!records.length) return reply(204);
  const routesRead = await asset(env, request, '/__csp/routes.json', validRoutes);
  if (!routesRead.ok) return unavailable('routes', routesRead.status);
  const routes = new Set(routesRead.value);
  const ctx = {
    meta,
    routes,
    host: url.host,
    origin: url.origin,
    day: utcDay(now),
    // Optional: without positions the item is 'ambiguous' (privacy-safe); nothing is cached on failure.
    positions: async (page) => {
      const r = await asset(env, request, `/__csp/pos/${await sha16(page)}.json`, validPositions);
      return r.ok ? r.value : null;
    },
  };
  const keys = [];
  for (const r of records) {
    const k = await normalize(r, ctx);
    if (k) keys.push(k);
  }
  if (keys.length) await env.CSP_REPORTS.batch(statements(env.CSP_REPORTS, coalesce(keys)));
  return reply(204);
}

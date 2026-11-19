// /weather.json: current conditions from the home weather station.
//
// GET  : public. Serves the last snapshot from Workers KV (binding WEATHER_KV, key "current").
//        Readable cross-origin only by michaelponders.com (the Blogger widget); same-origin needs no CORS.
// POST : the home station's publisher replaces the snapshot. Requires
//        "Authorization: Bearer <WEATHER_PUSH_TOKEN>" (a Pages secret). The body must be a v1 snapshot
//        no larger than MAX_BYTES and not older than the stored one.
// The snapshot is built from an allowlist at home; this endpoint never adds location or device data.

const KEY = 'current';
const MAX_BYTES = 64 * 1024;
const ALLOWED_ORIGINS = new Set(['https://www.michaelponders.com', 'https://michaelponders.com']);

function baseHeaders(request) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
  });
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return headers;
}

function json(request, status, body, extra = {}) {
  const headers = baseHeaders(request);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(JSON.stringify(body), { status, headers });
}

export function validSnapshot(data) {
  return Boolean(data)
    && typeof data === 'object'
    && !Array.isArray(data)
    && data.v === 1
    && Number.isFinite(data.observed)
    && data.observed > 1e9
    && data.observed < 1e10
    && typeof data.now === 'object'
    && data.now !== null;
}

async function sameSecret(given, expected) {
  if (!given || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function onRequestGet({ request, env }) {
  const kv = env && env.WEATHER_KV;
  if (!kv) return json(request, 503, { error: 'unavailable' }, { 'Cache-Control': 'no-store' });
  let data = null;
  try {
    const raw = await kv.get(KEY);
    data = raw ? JSON.parse(raw) : null;
  } catch (_error) {
    data = null;
  }
  if (!validSnapshot(data)) return json(request, 503, { error: 'unavailable' }, { 'Cache-Control': 'no-store' });
  return json(request, 200, data);
}

export async function onRequestOptions({ request }) {
  const headers = baseHeaders(request);
  headers.delete('Content-Type');
  return new Response(null, { status: 204, headers });
}

export async function onRequestPost({ request, env }) {
  const noStore = { 'Cache-Control': 'no-store' };
  const kv = env && env.WEATHER_KV;
  const expected = env && env.WEATHER_PUSH_TOKEN;
  if (!kv || !expected) return json(request, 503, { error: 'unavailable' }, noStore);
  const auth = request.headers.get('Authorization') || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!(await sameSecret(given, String(expected)))) return json(request, 401, { error: 'unauthorized' }, noStore);
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BYTES) return json(request, 413, { error: 'too large' }, noStore);
  const text = await request.text();
  if (text.length > MAX_BYTES) return json(request, 413, { error: 'too large' }, noStore);
  let data;
  try {
    data = JSON.parse(text);
  } catch (_error) {
    return json(request, 400, { error: 'bad json' }, noStore);
  }
  if (!validSnapshot(data)) return json(request, 400, { error: 'bad snapshot' }, noStore);
  try {
    const current = JSON.parse((await kv.get(KEY)) || 'null');
    if (validSnapshot(current) && data.observed < current.observed) {
      return json(request, 409, { error: 'older than stored' }, noStore);
    }
  } catch (_error) { /* a broken stored value is simply replaced */ }
  await kv.put(KEY, JSON.stringify(data));
  return json(request, 200, { ok: true, observed: data.observed }, noStore);
}

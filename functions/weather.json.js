// /weather.json: current conditions from the home weather station.
//
// GET  : public. Serves the last snapshot from Workers KV (binding WEATHER_KV, key "current").
//        Readable cross-origin only by michaelponders.com (the Blogger widget); same-origin needs no CORS.
// POST : the home station's publisher replaces the snapshot. Requires
//        "Authorization: Bearer <WEATHER_PUSH_TOKEN>" (a Pages secret). The body must be at most MAX_BYTES
//        (counted while reading) and match the v1 public schema below exactly; unknown fields are refused.
//
// The public schema is enforced here, not only at home: POST stores only the projection of SCHEMA, and GET
// projects the stored value again, so a field the privacy pages promise to omit can never be served.
//
// Ordering is best-effort for a single publisher. POST refuses (409) a snapshot whose `observed` time is
// strictly older than the value it reads from KV; an equal time is accepted and replaces it. That read is
// itself best-effort: Workers KV has no compare-and-swap and a read can be served from a cache up to about
// 60 s old, so a stale read can let an older snapshot through, and between two overlapping pushes
// last write wins. The home publisher sends one request at a time, every 5 minutes, so overlap does not happen in
// normal operation.
//
// Value ranges below are agreed with the publisher (PUBLIC_LIMITS in publisher.py), which sends null for
// a derived value outside its range. The label is a fixed word for the condition, never upstream text.

const KEY = 'current';
const MAX_BYTES = 64 * 1024;
const PLACE = 'Brandon, FL';
const ALLOWED_ORIGINS = new Set(['https://www.michaelponders.com', 'https://michaelponders.com']);

/* ---------------- public schema (v1) ---------------- */

const CONDS = ['sunny', 'partly', 'cloudy', 'rain', 'storm', 'fog', 'night'];
const num = (lo, hi, int = false) => ({ t: 'num', lo, hi, int });
const opt = (spec) => ({ ...spec, nullable: true });
const obj = (fields) => ({ t: 'obj', fields });
const arr = (of, min, max) => ({ t: 'arr', of, min, max });
const oneOf = (...values) => ({ t: 'enum', values });
const BOOL = { t: 'bool' };
const EPOCH = num(1e9, 1e10, true);
const TEMP = num(-60, 140);
const COND = oneOf(...CONDS);
const PCT = num(0, 100);
// The publisher's LABELS (the widget's own words). On read, an unfamiliar stored label becomes '' so the
// widget falls back to its label for `cond`; ingest refuses it.
const LABEL = { ...oneOf('', 'Sunny', 'Partly cloudy', 'Cloudy', 'Rain', 'Thunderstorm', 'Fog', 'Clear'), fallback: '' };

const SCHEMA = obj({
  v: oneOf(1),
  generated: EPOCH,
  observed: EPOCH,
  place: oneOf(PLACE),
  now: obj({
    cond: COND,
    label: LABEL,
    is_day: BOOL,
    temp_f: opt(TEMP),
    feels_f: opt(num(-80, 160)),
    humidity: opt(PCT),
    dew_f: opt(num(-100, 140)),
    pressure_inhg: opt(num(25, 33)),
    pressure_trend: opt(oneOf('rising', 'falling', 'steady')),
    wind_mph: opt(num(0, 250)),
    gust_mph: opt(num(0, 300)),
    wind_dir_deg: opt(num(0, 360)),
    uv: opt(num(0, 20)),
    solar_wm2: opt(num(0, 2000)),
    rain_today_in: opt(num(0, 100)),
    lightning_3h: num(0, 1e6, true),
    lightning_closest_mi: opt(num(0, 100)),
    lightning_last: opt(EPOCH),
  }),
  today: obj({ hi_f: opt(TEMP), lo_f: opt(TEMP), sunrise: opt(EPOCH), sunset: opt(EPOCH) }),
  rain: obj({ yesterday_in: opt(num(0, 100)), month_in: opt(num(0, 200)) }),
  aqi: opt(obj({ category: num(1, 6, true) })),
  hourly: arr(obj({ t: EPOCH, cond: COND, is_day: BOOL, temp_f: opt(TEMP), pop: opt(PCT) }), 0, 12),
  daily: arr(obj({ date: { t: 'str', re: /^\d{4}-\d{2}-\d{2}$/ }, cond: COND, lo_f: TEMP, hi_f: TEMP, pop: opt(PCT) }), 0, 6),
  history: obj({
    temp_f: arr(opt(TEMP), 25, 25),
    pressure_inhg: arr(opt(num(25, 33)), 25, 25),
    rain_in: arr(opt(num(0, 100)), 24, 24),
  }),
});

class Invalid extends Error {}

function project(spec, value, strict) {
  if (value === null && spec.nullable) return null;
  switch (spec.t) {
    case 'num':
      if (typeof value !== 'number' || !Number.isFinite(value) || value < spec.lo || value > spec.hi
        || (spec.int && !Number.isInteger(value))) throw new Invalid();
      return value;
    case 'bool':
      if (typeof value !== 'boolean') throw new Invalid();
      return value;
    case 'enum':
      if (spec.values.includes(value)) return value;
      if (!strict && Object.hasOwn(spec, 'fallback')) return spec.fallback;
      throw new Invalid();
    case 'str':
      if (typeof value !== 'string' || !spec.re.test(value)) throw new Invalid();
      return value;
    case 'arr':
      if (!Array.isArray(value) || value.length < spec.min || value.length > spec.max) throw new Invalid();
      return value.map((item) => project(spec.of, item, strict));
    case 'obj': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Invalid();
      if (strict && Object.keys(value).some((key) => !Object.hasOwn(spec.fields, key))) throw new Invalid();
      const out = {};
      for (const [key, field] of Object.entries(spec.fields)) {
        if (!Object.hasOwn(value, key)) throw new Invalid();
        out[key] = project(field, value[key], strict);
      }
      return out;
    }
    default:
      throw new Invalid();
  }
}

// A fresh object holding only public-schema fields, or null. strict (ingest) also refuses unknown fields;
// non-strict (serving a stored value) drops them.
export function publicSnapshot(data, { strict = false } = {}) {
  try {
    return project(SCHEMA, data, strict);
  } catch (error) {
    if (error instanceof Invalid) return null;
    throw error;
  }
}

export function validSnapshot(data) {
  return publicSnapshot(data, { strict: true }) !== null;
}

/* ---------------- HTTP ---------------- */

function baseHeaders(request) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
    'X-Content-Type-Options': 'nosniff',
    // JOURNAL-CSP-01 2b (D6): Functions don't get _headers; JSON needs no capabilities.
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
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

// Reads at most max bytes of the body; stops and returns null as soon as it is exceeded.
export async function readCapped(request, max) {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

export async function onRequestGet({ request, env }) {
  const kv = env && env.WEATHER_KV;
  if (!kv) return json(request, 503, { error: 'unavailable' }, { 'Cache-Control': 'no-store' });
  let data = null;
  try {
    const raw = await kv.get(KEY);
    data = raw ? publicSnapshot(JSON.parse(raw)) : null;
  } catch (_error) {
    data = null;
  }
  if (!data) return json(request, 503, { error: 'unavailable' }, { 'Cache-Control': 'no-store' });
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
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) return json(request, 413, { error: 'too large' }, noStore);
  const bytes = await readCapped(request, MAX_BYTES);
  if (bytes === null) return json(request, 413, { error: 'too large' }, noStore);
  let data;
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (_error) {
    return json(request, 400, { error: 'bad json' }, noStore);
  }
  const snapshot = publicSnapshot(data, { strict: true });
  if (!snapshot) return json(request, 400, { error: 'bad snapshot' }, noStore);
  try {
    const current = publicSnapshot(JSON.parse((await kv.get(KEY)) || 'null'));
    if (current && snapshot.observed < current.observed) {
      return json(request, 409, { error: 'older than stored' }, noStore);
    }
  } catch (_error) { /* a broken stored value is simply replaced */ }
  await kv.put(KEY, JSON.stringify(snapshot));
  return json(request, 200, { ok: true, observed: snapshot.observed }, noStore);
}

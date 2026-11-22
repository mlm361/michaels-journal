import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { onRequestGet, onRequestPost, onRequestOptions, validSnapshot } from '../functions/weather.json.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function memoryKv(initial = null) {
  const store = new Map();
  if (initial !== null) store.set('current', initial);
  return { store, get: async (k) => (store.has(k) ? store.get(k) : null), put: async (k, v) => { store.set(k, v); } };
}

function sample(overrides = {}) {
  return {
    v: 1,
    generated: Math.floor(Date.now() / 1000) - 60,
    observed: Math.floor(Date.now() / 1000) - 120,
    place: 'Brandon, FL',
    now: { cond: 'partly', label: 'Partly cloudy', is_day: true, temp_f: 78, feels_f: 80, humidity: 71, dew_f: 68,
      pressure_inhg: 30.02, pressure_trend: 'steady', wind_mph: 8, gust_mph: 14, wind_dir_deg: 62, uv: 4, solar_wm2: 455,
      rain_today_in: 0, lightning_3h: 0, lightning_closest_mi: null, lightning_last: null },
    today: { hi_f: 81, lo_f: 65, sunrise: 1795089780, sunset: 1795127760 },
    rain: { yesterday_in: 0.4, month_in: 2.31 },
    aqi: { category: 1 },
    hourly: [{ t: 1795114800, cond: 'partly', is_day: true, temp_f: 78, pop: 10 }, { t: 1795118400, cond: 'rain', is_day: true, temp_f: 76, pop: 40 }],
    daily: [{ date: '2026-11-19', cond: 'partly', lo_f: 65, hi_f: 81, pop: 10 }, { date: '2026-11-20', cond: 'sunny', lo_f: 63, hi_f: 82, pop: 0 }],
    history: {
      temp_f: Array.from({ length: 25 }, (_, k) => 70 + (k % 8)),
      pressure_inhg: Array.from({ length: 25 }, (_, k) => (k === 3 ? null : 30.02)),
      rain_in: Array.from({ length: 24 }, (_, k) => (k === 20 ? 0.02 : 0)),
    },
    ...overrides,
  };
}

const get = (origin) => new Request('https://michaelreflects.com/weather.json', origin ? { headers: { Origin: origin } } : {});
const post = (body, token, extraHeaders = {}) => new Request('https://michaelreflects.com/weather.json', {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extraHeaders },
});

/* ---------------- endpoint ---------------- */

test('GET without a KV binding or snapshot is a no-store 503', async () => {
  let r = await onRequestGet({ request: get(), env: {} });
  assert.equal(r.status, 503);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  r = await onRequestGet({ request: get(), env: { WEATHER_KV: memoryKv() } });
  assert.equal(r.status, 503);
  r = await onRequestGet({ request: get(), env: { WEATHER_KV: memoryKv('{"v":2}') } });
  assert.equal(r.status, 503);
  r = await onRequestGet({ request: get(), env: { WEATHER_KV: memoryKv('not json') } });
  assert.equal(r.status, 503);
});

test('GET serves the snapshot with a short public cache and CORS only for michaelponders.com', async () => {
  const kv = memoryKv(JSON.stringify(sample()));
  let r = await onRequestGet({ request: get(), env: { WEATHER_KV: kv } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Cache-Control'), 'public, max-age=60');
  assert.match(r.headers.get('Content-Type'), /^application\/json/);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await r.json()).place, 'Brandon, FL');

  for (const origin of ['https://www.michaelponders.com', 'https://michaelponders.com']) {
    r = await onRequestGet({ request: get(origin), env: { WEATHER_KV: kv } });
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(r.headers.get('Vary'), 'Origin');
  }
  for (const origin of ['https://evil.example', 'http://www.michaelponders.com', 'https://michaelponders.com.evil.example', 'null']) {
    r = await onRequestGet({ request: get(origin), env: { WEATHER_KV: kv } });
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), null, origin);
  }
  r = await onRequestOptions({ request: get('https://www.michaelponders.com') });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Methods'), 'GET');
});

test('POST requires the push token and stores only valid, newer snapshots', async () => {
  const kv = memoryKv();
  const env = { WEATHER_KV: kv, WEATHER_PUSH_TOKEN: 'correct horse battery staple' };
  assert.equal((await onRequestPost({ request: post(sample()), env })).status, 401);
  assert.equal((await onRequestPost({ request: post(sample(), 'wrong'), env })).status, 401);
  assert.equal((await onRequestPost({ request: post(sample(), 'correct horse battery staple'), env: { WEATHER_KV: kv } })).status, 503);
  assert.equal(kv.store.size, 0);

  assert.equal((await onRequestPost({ request: post('{nope', env.WEATHER_PUSH_TOKEN), env })).status, 400);
  assert.equal((await onRequestPost({ request: post({ v: 1, observed: 'soon', now: {} }, env.WEATHER_PUSH_TOKEN), env })).status, 400);
  assert.equal((await onRequestPost({ request: post('x'.repeat(70 * 1024), env.WEATHER_PUSH_TOKEN), env })).status, 413);
  assert.equal(kv.store.size, 0);

  const first = sample();
  const ok = await onRequestPost({ request: post(first, env.WEATHER_PUSH_TOKEN), env });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Cache-Control'), 'no-store');
  assert.equal(JSON.parse(kv.store.get('current')).observed, first.observed);

  const older = sample({ observed: first.observed - 600 });
  assert.equal((await onRequestPost({ request: post(older, env.WEATHER_PUSH_TOKEN), env })).status, 409);
  assert.equal(JSON.parse(kv.store.get('current')).observed, first.observed);
});

test('validSnapshot rejects wrong shapes', () => {
  assert.equal(validSnapshot(null), false);
  assert.equal(validSnapshot([]), false);
  assert.equal(validSnapshot({ v: 1, observed: 1795113817 }), false);
  assert.equal(validSnapshot({ v: 1, observed: 12, now: {} }), false);
  assert.equal(validSnapshot(sample()), true);
});

/* ---------------- WX-01 rework (Sally review 2026-11-21) ---------------- */

const TOKEN = 'correct horse battery staple';
const withNow = (patch) => sample({ now: { ...sample().now, ...patch } });

test('ingest refuses unknown top-level and nested fields, wrong types and out-of-bounds arrays', async () => {
  const s = sample();
  const bad = {
    'top-level field': sample({ station_id: 12345 }),
    'now field': withNow({ station_serial: 'ST-00000000' }),
    'today field': sample({ today: { ...s.today, moon: 'Waxing gibbous' } }),
    'rain field': sample({ rain: { ...s.rain, lat: 27.9 } }),
    'aqi field': sample({ aqi: { category: 1, pm2_5: 9 } }),
    'hourly item field': sample({ hourly: [{ ...s.hourly[0], lat: 27.9 }] }),
    'daily item field': sample({ daily: [{ ...s.daily[0], lon: -82.3 }] }),
    'history field': sample({ history: { ...s.history, elevation_m: 10 } }),
    'missing field': (() => { const x = sample(); delete x.now.uv; return x; })(),
    'now as array': sample({ now: [s.now] }),
    'today as array': sample({ today: [] }),
    'string number': withNow({ temp_f: '78' }),
    'boolean as number': withNow({ is_day: 1 }),
    'unknown condition': withNow({ cond: 'blizzard' }),
    'label with control char': withNow({ label: 'Rain\u0007' }),
    'label too long': withNow({ label: 'x'.repeat(41) }),
    'other place': sample({ place: 'Tampa, FL' }),
    'version 2': sample({ v: 2 }),
    'fractional epoch': sample({ observed: 1795113817.5 }),
    'aqi out of range': sample({ aqi: { category: 7 } }),
    'hourly too long': sample({ hourly: Array.from({ length: 13 }, () => s.hourly[0]) }),
    'daily too long': sample({ daily: Array.from({ length: 7 }, () => s.daily[0]) }),
    'history too short': sample({ history: { ...s.history, temp_f: s.history.temp_f.slice(1) } }),
    'history item type': sample({ history: { ...s.history, rain_in: [...s.history.rain_in.slice(1), 'x'] } }),
  };
  for (const [name, snap] of Object.entries(bad)) {
    const kv = memoryKv();
    const r = await onRequestPost({ request: post(snap, TOKEN), env: { WEATHER_KV: kv, WEATHER_PUSH_TOKEN: TOKEN } });
    assert.equal(r.status, 400, name);
    assert.equal(kv.store.size, 0, name);
  }
  // Nulls the publisher really sends are fine, and the stored value is exactly the public projection.
  const kv = memoryKv();
  const good = sample({ aqi: null, now: { ...s.now, uv: null, pressure_trend: null, lightning_last: s.observed - 60 } });
  assert.equal((await onRequestPost({ request: post(good, TOKEN), env: { WEATHER_KV: kv, WEATHER_PUSH_TOKEN: TOKEN } })).status, 200);
  assert.deepEqual(JSON.parse(kv.store.get('current')), good);
});

test('GET projects a stored value: unknown fields are dropped and a wrong shape is not served', async () => {
  const s = sample();
  const stored = { ...s, station_id: 12345, now: { ...s.now, lat: 27.9 }, hourly: [{ ...s.hourly[0], serial: 'HB-1' }] };
  const r = await onRequestGet({ request: get(), env: { WEATHER_KV: memoryKv(JSON.stringify(stored)) } });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body, sample({ observed: s.observed, generated: s.generated, hourly: [s.hourly[0]] }));
  assert.equal(JSON.stringify(body).includes('27.9') || JSON.stringify(body).includes('HB-1') || 'station_id' in body, false);
  for (const broken of [sample({ now: [s.now] }), sample({ hourly: 'none' }), withNow({ temp_f: '78' })]) {
    const g = await onRequestGet({ request: get(), env: { WEATHER_KV: memoryKv(JSON.stringify(broken)) } });
    assert.equal(g.status, 503);
  }
});

function streamPost(chunks, headers = {}) {
  let pulls = 0;
  const body = new ReadableStream({ // highWaterMark 0: a chunk is pulled only when the endpoint reads
    pull(controller) {
      if (pulls < chunks.length) controller.enqueue(chunks[pulls]);
      else controller.close();
      pulls += 1;
    },
  }, { highWaterMark: 0 });
  const request = new Request('https://michaelreflects.com/weather.json', {
    method: 'POST', body, duplex: 'half', headers: { Authorization: 'Bearer ' + TOKEN, ...headers },
  });
  return { request, pulls: () => pulls };
}

test('POST counts body bytes while reading and stops at the 64 KiB ceiling', async () => {
  const env = () => ({ WEATHER_KV: memoryKv(), WEATHER_PUSH_TOKEN: TOKEN });
  // No Content-Length: reading stops on the chunk that crosses the ceiling; later chunks are never pulled.
  const big = streamPost([new Uint8Array(60 * 1024), new Uint8Array(8 * 1024), new Uint8Array(8 * 1024), new Uint8Array(8 * 1024)]);
  let e = env();
  assert.equal((await onRequestPost({ request: big.request, env: e })).status, 413);
  assert.equal(big.pulls(), 2);
  assert.equal(e.WEATHER_KV.store.size, 0);
  // Bytes, not UTF-16 units: 22,000 three-byte characters are 66,000 bytes.
  const euros = new TextEncoder().encode('"' + '€'.repeat(22000) + '"');
  assert.ok('€'.repeat(22000).length < 64 * 1024 && euros.byteLength > 64 * 1024);
  assert.equal((await onRequestPost({ request: streamPost([euros]).request, env: env() })).status, 413);
  // A declared length over the ceiling is refused before any read.
  const declared = streamPost([new Uint8Array(10)], { 'Content-Length': String(64 * 1024 + 1) });
  assert.equal((await onRequestPost({ request: declared.request, env: env() })).status, 413);
  assert.equal(declared.pulls(), 0);
  // Exactly at the ceiling is read in full (then refused as JSON); invalid UTF-8 is bad JSON.
  assert.equal((await onRequestPost({ request: streamPost([new Uint8Array(64 * 1024).fill(32)]).request, env: env() })).status, 400);
  assert.equal((await onRequestPost({ request: streamPost([new Uint8Array([0x7b, 0xff, 0x7d])]).request, env: env() })).status, 400);
  // A valid snapshot sent as a stream in pieces is accepted.
  const bytes = new TextEncoder().encode(JSON.stringify(sample()));
  e = env();
  assert.equal((await onRequestPost({ request: streamPost([bytes.slice(0, 100), bytes.slice(100)]).request, env: e })).status, 200);
  assert.equal(e.WEATHER_KV.store.size, 1);
});

test('ordering is best-effort for one publisher: a stale KV read cannot stop an older push (documented)', async () => {
  const newer = sample();
  const older = sample({ observed: newer.observed - 600 });
  // Fresh read: an older observation is refused.
  const kv = memoryKv(JSON.stringify(newer));
  assert.equal((await onRequestPost({ request: post(older, TOKEN), env: { WEATHER_KV: kv, WEATHER_PUSH_TOKEN: TOKEN } })).status, 409);
  // Stale cached read (KV is eventually consistent, no compare-and-swap): last write wins.
  const store = new Map([['current', JSON.stringify(newer)]]);
  const staleKv = { store, get: async () => JSON.stringify(sample({ observed: newer.observed - 1200 })), put: async (k, v) => { store.set(k, v); } };
  assert.equal((await onRequestPost({ request: post(older, TOKEN), env: { WEATHER_KV: staleKv, WEATHER_PUSH_TOKEN: TOKEN } })).status, 200);
  assert.equal(JSON.parse(store.get('current')).observed, older.observed);
  // The contract says so where the endpoint is defined.
  const source = read('functions/weather.json.js');
  assert.match(source, /Ordering is best-effort for a single publisher/);
  assert.match(source, /last write wins/);
});

/* ---------------- widget script ---------------- */

function loadWidget() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(read('static/js/weather.js'), context, { filename: 'weather.js' });
  return context.window.MichaelWeather;
}

test('widget escapes hostile strings and never writes inline style attributes', () => {
  const W = loadWidget();
  const hostile = sample({
    place: '<img src=x onerror=alert(1)>',
    now: { ...sample().now, cond: '"><script>alert(1)</script>', label: '<b onmouseover=alert(1)>Sunny</b>' },
    today: { ...sample().today, moon: '</span><script>x()</script>' },
  });
  const d = W.normalize(hostile);
  assert.equal(d.now.cond, 'cloudy');
  for (const html of [W.widgetHtml(d), W.pageHtml(d)]) {
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /<b onmouseover/);
    assert.doesNotMatch(html, /<[^>]*\sstyle=/, 'no inline style attributes (CSP-ready)');
    assert.doesNotMatch(html, /<[^>]*\son[a-z]+=/i, 'no inline event handlers inside any tag');
  }
  assert.match(W.widgetHtml(d), /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('widget normalize coerces numbers, drops junk and rejects other versions', () => {
  const W = loadWidget();
  assert.equal(W.normalize({ ...sample(), v: 2 }), null);
  assert.equal(W.normalize({ ...sample(), observed: 'yesterday' }), null);
  const d = W.normalize(sample({
    now: { ...sample().now, temp_f: '1e400', humidity: 150, wind_dir_deg: true, uv: '7' },
    aqi: { category: 9 },
    hourly: 'nope',
    daily: [{ date: '2026-13-99x', lo_f: 1, hi_f: 2 }, { date: '2026-11-21', cond: 'storm', lo_f: 68, hi_f: 79, pop: 60 }],
  }));
  assert.equal(d.now.temp, null);
  assert.equal(d.now.humidity, null);
  assert.equal(d.now.dir, null);
  assert.equal(d.now.uv, 7);
  assert.equal(d.aqi, null);
  assert.equal(d.hourly.length, 0);
  assert.equal(d.daily.length, 1);
  assert.match(W.widgetHtml(d), />–</);
});

test('a snapshot older than two hours renders the offline card', () => {
  const W = loadWidget();
  const d = W.normalize(sample({ observed: Math.floor(Date.now() / 1000) - 3 * 3600 }));
  const html = W.widgetHtml(d);
  assert.match(html, /The weather station is offline/);
  assert.match(html, /wx-sky-offline/);
});

test('moon phase matches known eclipses and points at a real self-hosted AVIF', () => {
  const W = loadWidget();
  const solarEclipse = W.moonInfo(Date.UTC(2024, 3, 8, 18, 17));   // total solar eclipse = new moon
  assert.ok(solarEclipse.illum < 0.01, String(solarEclipse.illum));
  assert.equal(solarEclipse.name, 'New moon');
  assert.equal(solarEclipse.frame, 0);
  const lunarEclipse = W.moonInfo(Date.UTC(2025, 2, 14, 6, 58));   // total lunar eclipse = full moon
  assert.ok(lunarEclipse.illum > 0.99, String(lunarEclipse.illum));
  assert.equal(lunarEclipse.name, 'Full moon');
  assert.equal(lunarEclipse.frame, 15);
  const nextFull = W.moonInfo(Date.UTC(2025, 2, 1)).nextFull;
  assert.ok(Math.abs(nextFull - Date.UTC(2025, 2, 14, 6, 55)) < 3 * 3600000, new Date(nextFull).toISOString());
  const waxing = W.moonInfo(Date.UTC(2025, 2, 10, 12));
  assert.equal(waxing.name, 'Waxing gibbous');
  for (let k = 0; k < 30; k++) {
    const file = path.join(root, 'static/img/moon', 'moon-' + String(k).padStart(2, '0') + '.avif');
    assert.ok(fs.statSync(file).size < 12 * 1024, file);
  }
  assert.match(W.pageHtml(W.normalize(sample())), /<img class="wx-moon-img" src="\/img\/moon\/moon-\d\d\.avif" width="96" height="96" alt="The moon now: [A-Za-z ]+, \d+% lit">/);
});

function loadAs(attrs) {
  const script = { src: attrs.src, getAttribute: (k) => (k in attrs ? attrs[k] : null) };
  const context = { window: { document: { currentScript: script } } };
  vm.createContext(context);
  vm.runInContext(read('static/js/weather.js'), context, { filename: 'weather.js' });
  return context.window.MichaelWeather;
}

test('michaelponders mode reads from michaelreflects.com and links to the Blogger page', () => {
  const W = loadAs({ src: 'https://michaelreflects.com/js/weather.js', 'data-wx-site': 'ponders' });
  assert.equal(W.site, 'ponders');
  assert.equal(W.endpoint, 'https://michaelreflects.com/weather.json');
  const d = W.normalize(sample());
  assert.match(W.widgetHtml(d), /href="https:\/\/www\.michaelponders\.com\/p\/weather\.html"/);
  assert.match(W.pageHtml(d), /src="https:\/\/michaelreflects\.com\/img\/moon\/moon-\d\d\.avif"/);
  // A copy served from anywhere else still talks only to michaelreflects.com.
  assert.equal(loadAs({ src: 'https://evil.example/js/weather.js', 'data-wx-site': 'ponders' }).endpoint, 'https://michaelreflects.com/weather.json');
  // The journal is unchanged: same-origin data, local page link and moon path.
  const J = loadAs({ src: 'https://michaelreflects.com/js/weather.js' });
  assert.equal(J.site, 'journal');
  assert.equal(J.endpoint, '/weather.json');
  assert.match(J.widgetHtml(d), /href="\/weather\/"/);
  assert.match(J.pageHtml(d), /src="\/img\/moon\//);
  assert.match(read('static/css/ponders-weather.css'), /min-width: 1440px/);
});

/* ---------------- wiring ---------------- */

test('templates, routes and page are wired up', () => {
  const base = read('themes/ergo/templates/base.html');
  assert.match(base, /<link rel="stylesheet" href="\/css\/weather\.css\?v=\d+">/);
  assert.match(base, /<script src="\/js\/weather\.js\?v=\d+" defer><\/script>/);
  assert.match(base, /class="wx wx-side"/);
  assert.match(base, /class="wx wx-foot-wrap"/);
  assert.match(read('templates/menu.html'), /\/weather\/">🌦️ Weather</);
  assert.ok(JSON.parse(read('static/_routes.json')).include.includes('/weather.json'));
  const page = read('content/weather.md');
  assert.match(page, /body_class = "weather-theme-page"/);
  assert.match(page, /id="wx-page"/);
  assert.match(read('content/privacy.md'), /### Weather[\s\S]*\/weather\.json[\s\S]*never contacts Tempest or WeatherAPI\.com/);
  assert.match(read('content/colophon.md'), /<h3>Weather at Home<\/h3>/);
  // Sources (Sally review 2026-11-21): Tempest supplies the forecast; WeatherAPI.com only UV and air quality.
  const credits = ['content/colophon.md', 'content/privacy.md', 'blogger/weather/4-privacy-weather-section.html', 'static/js/weather.js'];
  for (const file of credits) {
    const text = read(file);
    assert.match(text, /forecast comes from the Tempest forecast service/, file);
    assert.doesNotMatch(text, /forecast, UV index,? and air quality/i, file);
  }
  assert.match(read('content/colophon.md'), /source of its forecast, and \[WeatherAPI\.com\]\([^)]*\), which supplies its UV index and air quality\./);
  for (const file of ['static/js/weather.js', 'static/css/weather.css', 'static/css/weather-page.css', 'content/weather.md']) {
    assert.doesNotMatch(read(file), /\b(ST|HB)-\d{6,}/, file + ' must not contain station or hub serials');
    assert.doesNotMatch(read(file), /27\.9\d{2,}|-82\.2\d{2,}/, file + ' must not contain coordinates');
  }
});

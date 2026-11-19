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
    observed: Math.floor(Date.now() / 1000) - 120,
    place: 'Brandon, FL',
    now: { cond: 'partly', label: 'Partly cloudy', is_day: true, temp_f: 78, feels_f: 80, humidity: 71, dew_f: 68,
      pressure_inhg: 30.02, pressure_trend: 'steady', wind_mph: 8, gust_mph: 14, wind_dir_deg: 62, uv: 4, solar_wm2: 455,
      rain_today_in: 0, lightning_3h: 0 },
    today: { hi_f: 81, lo_f: 65, sunrise: 1795089780, sunset: 1795127760, moon: 'Waxing gibbous' },
    rain: { yesterday_in: 0.4, month_in: 2.31 },
    aqi: { category: 1 },
    hourly: [{ t: 1795114800, cond: 'partly', is_day: true, temp_f: 78, pop: 10 }, { t: 1795118400, cond: 'rain', is_day: true, temp_f: 76, pop: 40 }],
    daily: [{ date: '2026-11-19', cond: 'partly', lo_f: 65, hi_f: 81, pop: 10 }, { date: '2026-11-20', cond: 'sunny', lo_f: 63, hi_f: 82, pop: 0 }],
    history: { temp_f: [70, 72, 75, 78], pressure_inhg: [30.0, 30.01, 30.02, 30.02], rain_in: [0, 0, 0.02, 0] },
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
  assert.match(read('content/privacy.md'), /### Weather[\s\S]*\/weather\.json[\s\S]*never contacts WeatherAPI\.com/);
  assert.match(read('content/colophon.md'), /<h3>Weather at Home<\/h3>/);
  for (const file of ['static/js/weather.js', 'static/css/weather.css', 'static/css/weather-page.css', 'content/weather.md']) {
    assert.doesNotMatch(read(file), /\b(ST|HB)-\d{6,}/, file + ' must not contain station or hub serials');
    assert.doesNotMatch(read(file), /27\.9\d{2,}|-82\.2\d{2,}/, file + ' must not contain coordinates');
  }
});

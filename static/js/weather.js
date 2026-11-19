/*
 * Weather at home: sidebar/footer widget + /weather/ page.
 * Data: /weather.json (Pages Function, filled by the home weather station; see functions/weather.json.js).
 * Hardening: every string from the JSON is escaped or matched against a fixed list, every number is
 * coerced with toNum(), and no inline style attributes are written (dynamic values go through CSSOM).
 */
(function (root) {
  'use strict';

  var ENDPOINT = '/weather.json';
  var REFRESH_MS = 5 * 60 * 1000;
  var STALE_S = 20 * 60;
  var OFFLINE_S = 2 * 60 * 60;
  var TZ = 'America/New_York';
  var CONDS = ['sunny', 'partly', 'cloudy', 'rain', 'storm', 'fog', 'night'];
  var LABELS = { sunny: 'Sunny', partly: 'Partly cloudy', cloudy: 'Cloudy', rain: 'Rain', storm: 'Thunderstorm', fog: 'Fog', night: 'Clear' };
  var AQI = [null,
    { name: 'Good', short: 'Good' }, { name: 'Moderate', short: 'Moderate' },
    { name: 'Unhealthy for sensitive groups', short: 'Sensitive' }, { name: 'Unhealthy', short: 'Unhealthy' },
    { name: 'Very unhealthy', short: 'Very poor' }, { name: 'Hazardous', short: 'Hazardous' }];
  var COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  var TRENDS = { rising: 'rising', falling: 'falling', steady: 'steady' };

  /* ---------------- data hygiene ---------------- */
  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function toNum(value, min, max) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    var n = Number(value);
    if (!isFinite(n)) return null;
    if (min !== undefined && n < min) return null;
    if (max !== undefined && n > max) return null;
    return n;
  }
  function cond(value) { return CONDS.indexOf(value) >= 0 ? value : 'cloudy'; }
  function shortText(value, max) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  }
  function list(value, max) { return Array.isArray(value) ? value.slice(0, max) : []; }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
    var now = raw.now || {}, today = raw.today || {}, rain = raw.rain || {}, hist = raw.history || {};
    var observed = toNum(raw.observed, 1e9, 1e10);
    if (observed === null) return null;
    var c = cond(now.cond);
    return {
      observed: observed,
      place: shortText(raw.place, 40) || 'Brandon, FL',
      now: {
        cond: c,
        label: shortText(now.label, 40) || LABELS[c],
        isDay: now.is_day !== false,
        temp: toNum(now.temp_f, -60, 140), feels: toNum(now.feels_f, -80, 160),
        humidity: toNum(now.humidity, 0, 100), dew: toNum(now.dew_f, -80, 120),
        pressure: toNum(now.pressure_inhg, 25, 33), trend: TRENDS[now.pressure_trend] || null,
        wind: toNum(now.wind_mph, 0, 250), gust: toNum(now.gust_mph, 0, 300), dir: toNum(now.wind_dir_deg, 0, 360),
        uv: toNum(now.uv, 0, 20), solar: toNum(now.solar_wm2, 0, 2000), rainToday: toNum(now.rain_today_in, 0, 60),
        strikes: toNum(now.lightning_3h, 0, 100000), closest: toNum(now.lightning_closest_mi, 0, 100),
        lastStrike: toNum(now.lightning_last, 1e9, 1e10)
      },
      today: {
        hi: toNum(today.hi_f, -60, 140), lo: toNum(today.lo_f, -60, 140),
        sunrise: toNum(today.sunrise, 1e9, 1e10), sunset: toNum(today.sunset, 1e9, 1e10)
      },
      rain: { yesterday: toNum(rain.yesterday_in, 0, 60), month: toNum(rain.month_in, 0, 200) },
      aqi: toNum(raw.aqi && raw.aqi.category, 1, 6),
      hourly: list(raw.hourly, 24).map(function (h) {
        return { t: toNum(h && h.t, 1e9, 1e10), cond: cond(h && h.cond), isDay: !(h && h.is_day === false),
          temp: toNum(h && h.temp_f, -60, 140), pop: toNum(h && h.pop, 0, 100) };
      }).filter(function (h) { return h.t !== null && h.temp !== null; }).slice(0, 12),
      daily: list(raw.daily, 10).map(function (d) {
        var date = typeof (d && d.date) === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : null;
        return { date: date, cond: cond(d && d.cond), lo: toNum(d && d.lo_f, -60, 140), hi: toNum(d && d.hi_f, -60, 140), pop: toNum(d && d.pop, 0, 100) };
      }).filter(function (d) { return d.date && d.lo !== null && d.hi !== null; }).slice(0, 6),
      history: {
        temp: list(hist.temp_f, 49).map(function (v) { return toNum(v, -60, 140); }),
        pressure: list(hist.pressure_inhg, 49).map(function (v) { return toNum(v, 25, 33); }),
        rain: list(hist.rain_in, 48).map(function (v) { return toNum(v, 0, 20); })
      }
    };
  }

  /* ---------------- formatting ---------------- */
  function fmt(n, digits) { return n === null ? '–' : n.toFixed(digits || 0); }
  function deg(n) { return n === null ? '–' : Math.round(n) + '°'; }
  function compass(d) { return d === null ? '' : COMPASS[Math.round(d / 22.5) % 16]; }
  function clock(epoch) {
    try {
      return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(new Date(epoch * 1000));
    } catch (_e) { return ''; }
  }
  function hourLabel(epoch) {
    try {
      return new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone: TZ }).format(new Date(epoch * 1000));
    } catch (_e) { return ''; }
  }
  function dayLabel(date, index) {
    if (index === 0) return 'Today';
    var parts = date.split('-');
    var d = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2], 12));
    return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(d);
  }
  function ago(epoch) {
    var s = Math.max(0, Math.round(Date.now() / 1000 - epoch));
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  }
  function uvWord(uv) { return uv === null ? '' : uv >= 11 ? 'extreme' : uv >= 8 ? 'very high' : uv >= 6 ? 'high' : uv >= 3 ? 'moderate' : 'low'; }

  /* ---------------- moon (calculated here; the phase is the same everywhere on Earth) ---------------- */
  // Low-precision lunar phase angle (Meeus, Astronomical Algorithms ch. 48), good to well under an hour.
  var MOON_NAMES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  function moonAngles(ms) {
    var rad = Math.PI / 180;
    var T = (ms / 86400000 + 2440587.5 - 2451545) / 36525;
    var D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T;
    var M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T;
    var Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T;
    var i = 180 - D - 6.289 * Math.sin(Mp * rad) + 2.1 * Math.sin(M * rad) - 1.274 * Math.sin((2 * D - Mp) * rad) -
      0.658 * Math.sin(2 * D * rad) - 0.214 * Math.sin(2 * Mp * rad) - 0.11 * Math.sin(D * rad);
    return { elong: (((180 - i) % 360) + 360) % 360, illum: (1 + Math.cos(i * rad)) / 2 };
  }
  function nextMoonEvent(ms, target) {
    var prev = moonAngles(ms).elong;
    for (var h = 1; h <= 24 * 32; h++) {
      var t = ms + h * 3600000;
      var e = moonAngles(t).elong;
      if (target === 180 ? (prev < 180 && e >= 180) : (prev > 270 && e < 90)) return t;
      prev = e;
    }
    return null;
  }
  function moonInfo(ms) {
    var a = moonAngles(ms);
    var e = a.elong;
    var q = Math.round(e / 90) % 4;                       // nearest principal phase
    var off = Math.abs(((e - q * 90 + 540) % 360) - 180);  // degrees away from it
    var name = off <= 12 ? MOON_NAMES[q * 2] : MOON_NAMES[(Math.floor(e / 90) % 4) * 2 + 1];
    return { elong: e, illum: a.illum, name: name, frame: Math.round(e / 12) % 30,
      nextFull: nextMoonEvent(ms, 180), nextNew: nextMoonEvent(ms, 0) };
  }
  function shortDate(ms) {
    try {
      return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ }).format(new Date(ms));
    } catch (_e) { return ''; }
  }
  function moonTile() {
    var m = moonInfo(Date.now());
    var pct = Math.round(m.illum * 100);
    var file = '/img/moon/moon-' + (m.frame < 10 ? '0' : '') + m.frame + '.avif';
    return '<div class="wx-tile wx-wide wx-moon"><h4>The moon</h4><div class="wx-moon-row">' +
      '<img class="wx-moon-img" src="' + file + '" width="96" height="96" alt="' + esc('The moon now: ' + m.name + ', ' + pct + '% lit') + '">' +
      '<div class="wx-moon-text"><div class="wx-big wx-big-word">' + esc(m.name) + '</div><div class="wx-muted wx-small">' + pct + '% lit</div></div>' +
      '<div class="wx-moon-next">' + kv('Next full moon', m.nextFull ? shortDate(m.nextFull) : '–') + kv('Next new moon', m.nextNew ? shortDate(m.nextNew) : '–') + '</div>' +
      '</div></div>';
  }

  /* ---------------- icons (SVG, presentation attributes only) ---------------- */
  function cloud(x, y, s, fill, cls) {
    return '<g class="' + (cls || '') + '" transform="translate(' + x + ' ' + y + ') scale(' + s + ')" fill="' + fill + '">' +
      '<circle cx="30" cy="38" r="15"/><circle cx="50" cy="30" r="20"/><circle cx="70" cy="40" r="13"/><rect x="18" y="38" width="64" height="16" rx="8"/></g>';
  }
  function sun(cx, cy, r) {
    var rays = '';
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6;
      rays += '<line x1="' + (50 + Math.cos(a) * (r + 6)).toFixed(1) + '" y1="' + (50 + Math.sin(a) * (r + 6)).toFixed(1) +
        '" x2="' + (50 + Math.cos(a) * (r + 14)).toFixed(1) + '" y2="' + (50 + Math.sin(a) * (r + 14)).toFixed(1) +
        '" stroke="#ffd34d" stroke-width="3.2" stroke-linecap="round"/>';
    }
    return '<g transform="translate(' + (cx - 50) + ' ' + (cy - 50) + ')"><circle class="wx-glow" cx="50" cy="50" r="' + (r + 10) + '" fill="#ffe27a"/>' +
      '<g class="wx-spin">' + rays + '</g><circle cx="50" cy="50" r="' + r + '" fill="#ffc93a"/><circle cx="46" cy="45" r="' + (r * 0.55).toFixed(1) + '" fill="#fff0a0" opacity=".55"/></g>';
  }
  function moon(x, y, s) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><path d="M62 22 A28 28 0 1 0 78 64 A22 22 0 1 1 62 22 Z" fill="#f4f1d8"/></g>';
  }
  function drops(xs, y, delayStep) {
    return xs.map(function (x, i) {
      return '<line class="wx-drop" data-wx-css="animation-delay:' + (i * delayStep).toFixed(2) + 's" x1="' + x + '" y1="' + y + '" x2="' + (x - 4) + '" y2="' + (y + 10) + '" stroke="#8fd0ff" stroke-width="3" stroke-linecap="round"/>';
    }).join('');
  }
  function icon(c, isDay) {
    var b = '';
    if (c === 'night' || (!isDay && (c === 'sunny'))) {
      b = moon(0, 0, 1) + [[22, 24, 0], [84, 30, 1.1], [30, 78, 2], [82, 82, 0.6]].map(function (s) {
        return '<circle class="wx-tw" data-wx-css="animation-delay:' + s[2] + 's" cx="' + s[0] + '" cy="' + s[1] + '" r="2" fill="#fff"/>';
      }).join('');
    } else if (c === 'sunny') b = sun(50, 50, 20);
    else if (c === 'partly') b = (isDay ? sun(40, 40, 15) : moon(-10, -12, 0.75)) + cloud(14, 34, 0.86, '#ffffff', 'wx-drift');
    else if (c === 'cloudy') b = cloud(-2, 6, 0.8, '#d6dee8', 'wx-drift2') + cloud(14, 26, 0.9, '#ffffff', 'wx-drift');
    else if (c === 'fog') b = cloud(8, 4, 0.9, '#e8eef5', 'wx-drift2') + '<g stroke="#e8eef5" stroke-width="4" stroke-linecap="round" class="wx-drift"><line x1="18" y1="66" x2="82" y2="66"/><line x1="26" y1="78" x2="74" y2="78"/></g>';
    else if (c === 'rain') b = cloud(8, 14, 0.95, '#e8eef5', 'wx-drift2') + drops([30, 46, 62, 78], 70, 0.27);
    else b = cloud(8, 10, 0.95, '#c9cfdc', 'wx-drift2') + '<path class="wx-bolt" d="M52 58 L40 78 L50 78 L44 94 L62 70 L52 70 L58 58 Z" fill="#ffd34d"/>' + drops([28, 74], 68, 0.4);
    return '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' + b + '</svg>';
  }
  function skyClass(d) {
    var c = d.now.cond;
    if (!d.now.isDay && (c === 'sunny' || c === 'night' || c === 'partly')) return 'wx-sky-night';
    return 'wx-sky-' + c;
  }
  function skyLayers(d) {
    var c = d.now.cond, h = '';
    if (c === 'partly' || c === 'cloudy' || c === 'rain' || c === 'storm' || c === 'fog') {
      h += '<svg class="wx-bgcloud wx-bgcloud-a" viewBox="0 0 100 60" aria-hidden="true">' + cloud(0, 0, 1, '#fff') + '</svg>';
      h += '<svg class="wx-bgcloud wx-bgcloud-b" viewBox="0 0 100 60" aria-hidden="true">' + cloud(0, 0, 1, '#fff') + '</svg>';
    }
    if (c === 'rain' || c === 'storm') {
      h += '<div class="wx-bgrain" aria-hidden="true">';
      for (var i = 0; i < 24; i++) {
        h += '<i data-wx-css="left:' + ((i * 37) % 100) + '%|animation-duration:' + (0.7 + (i % 5) * 0.12).toFixed(2) + 's|animation-delay:-' + ((i * 0.13) % 1).toFixed(2) + 's"></i>';
      }
      h += '</div>';
    }
    if (c === 'storm') h += '<div class="wx-flashlayer" aria-hidden="true"></div>';
    if (skyClass(d) === 'wx-sky-night') {
      h += '<svg class="wx-stars" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">';
      for (var j = 0; j < 22; j++) {
        h += '<circle class="wx-tw" data-wx-css="animation-delay:' + ((j * 0.37) % 3).toFixed(2) + 's" cx="' + ((j * 41) % 100) + '" cy="' + ((j * 23) % 60) + '" r="0.35" fill="#fff"/>';
      }
      h += '</svg>';
    }
    return h;
  }

  /* ---------------- CSSOM helper (no inline style attributes) ---------------- */
  var CSS_PROPS = { 'animation-delay': 1, 'animation-duration': 1, left: 1, width: 1, transform: 1 };
  function applyCss(scope) {
    var nodes = scope.querySelectorAll('[data-wx-css]');
    for (var i = 0; i < nodes.length; i++) {
      var pairs = nodes[i].getAttribute('data-wx-css').split('|');
      for (var j = 0; j < pairs.length; j++) {
        var k = pairs[j].indexOf(':');
        var prop = pairs[j].slice(0, k), val = pairs[j].slice(k + 1);
        if (CSS_PROPS[prop] && /^[-0-9a-z.%() ]+$/i.test(val)) nodes[i].style.setProperty(prop, val);
      }
      nodes[i].removeAttribute('data-wx-css');
    }
  }
  var reduceMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function countUp(el, to) {
    if (!el || to === null) return;
    if (reduceMotion || !root.requestAnimationFrame) { el.textContent = String(Math.round(to)); return; }
    var from = to - 6, start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / 900), e = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (p < 1) root.requestAnimationFrame(step);
    }
    root.requestAnimationFrame(step);
  }

  /* ---------------- widget ---------------- */
  var PIN = '<svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>';

  function ageState(d) {
    var age = Date.now() / 1000 - d.observed;
    return age > OFFLINE_S ? 'offline' : age > STALE_S ? 'stale' : 'live';
  }
  function widgetHtml(d) {
    var n = d.now, state = ageState(d), q = d.aqi ? AQI[d.aqi] : null;
    if (state === 'offline') {
      return '<div class="wx-sky wx-card wx-sky-offline"><div class="wx-in"><div class="wx-place">' + PIN + esc(d.place) + '</div>' +
        '<div class="wx-offline-msg">The weather station is offline.</div><div class="wx-foot"><span>Last reading ' + esc(ago(d.observed)) + '</span>' +
        '<a href="/weather/">Full weather ›</a></div></div></div>';
    }
    var hl = [];
    if (d.today.hi !== null) hl.push('H ' + deg(d.today.hi));
    if (d.today.lo !== null) hl.push('L ' + deg(d.today.lo));
    if (n.feels !== null) hl.push('Feels ' + deg(n.feels));
    return '<div class="wx-sky wx-card ' + skyClass(d) + '">' + skyLayers(d) + '<div class="wx-in">' +
      '<div class="wx-place">' + PIN + esc(d.place) + '</div>' +
      '<div class="wx-top"><div><div class="wx-temp"><span class="wx-t">' + fmt(n.temp) + '</span><sup>°F</sup></div>' +
      '<div class="wx-cond">' + esc(n.label) + '</div><div class="wx-hl">' + esc(hl.join(' · ')) + '</div></div>' +
      '<div class="wx-icon">' + icon(n.cond, n.isDay) + '</div></div>' +
      '<div class="wx-stats">' +
        '<div class="wx-stat">Wind<b>' + esc((compass(n.dir) + ' ' + fmt(n.wind) + ' mph').trim()) + '</b></div>' +
        '<div class="wx-stat">Rain today<b>' + fmt(n.rainToday, 2) + ' in</b></div>' +
        '<div class="wx-stat">UV<b>' + fmt(n.uv) + '</b></div>' +
        '<div class="wx-stat">Air<b>' + esc(q ? q.short : '–') + '</b></div>' +
      '</div>' +
      '<div class="wx-foot"><span><span class="wx-live' + (state === 'stale' ? ' wx-live-stale' : '') + '"></span>' +
        '<span class="wx-ago" data-wx-epoch="' + d.observed + '">Updated ' + esc(ago(d.observed)) + '</span></span>' +
        '<a href="/weather/">Full weather ›</a></div>' +
      '</div></div>';
  }

  /* ---------------- full page ---------------- */
  function linePath(vals, w, h, padT, padB) {
    var pts = [], min = Infinity, max = -Infinity;
    vals.forEach(function (v) { if (v !== null) { min = Math.min(min, v); max = Math.max(max, v); } });
    if (!isFinite(min)) return null;
    var rng = (max - min) || 1, step = vals.length > 1 ? w / (vals.length - 1) : w;
    vals.forEach(function (v, i) { if (v !== null) pts.push([i * step, padT + (1 - (v - min) / rng) * (h - padT - padB)]); });
    if (pts.length < 2) return null;
    var dd = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 1; i < pts.length; i++) {
      var p0 = pts[i - 1], p1 = pts[i], mx = ((p0[0] + p1[0]) / 2).toFixed(1);
      dd += ' C' + mx + ' ' + p0[1].toFixed(1) + ' ' + mx + ' ' + p1[1].toFixed(1) + ' ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1);
    }
    return { d: dd, area: dd + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + h + ' L' + pts[0][0].toFixed(1) + ' ' + h + ' Z', min: min, max: max };
  }
  function tempChart(vals) {
    var W = 600, H = 110, p = linePath(vals, W, H, 14, 18);
    if (!p) return '<p class="wx-muted wx-small">Not enough readings yet.</p>';
    return '<svg class="wx-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Temperature over the last 24 hours, from ' + Math.round(p.min) + ' to ' + Math.round(p.max) + ' degrees">' +
      '<defs><linearGradient id="wxtg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6a53c" stop-opacity=".45"/><stop offset="1" stop-color="#f6a53c" stop-opacity="0"/></linearGradient></defs>' +
      '<path class="wx-area" d="' + p.area + '" fill="url(#wxtg)"/><path class="wx-line" d="' + p.d + '" stroke="#f08a24"/>' +
      '<text x="4" y="12">' + Math.round(p.max) + '°</text><text x="4" y="' + (H - 4) + '">' + Math.round(p.min) + '°</text><text x="' + (W - 30) + '" y="' + (H - 4) + '">now</text></svg>';
  }
  function pressureChart(vals) {
    var W = 600, H = 80, p = linePath(vals, W, H, 10, 10);
    if (!p) return '';
    return '<svg class="wx-chart wx-chart-short" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Pressure over the last 24 hours, from ' + p.min.toFixed(2) + ' to ' + p.max.toFixed(2) + ' inches">' +
      '<path class="wx-line" d="' + p.d + '" stroke="#6f7fe0"/></svg>';
  }
  function rainChart(vals) {
    if (!vals.length) return '';
    var W = 600, H = 70, n = vals.length, bars = '', peak = 0;
    vals.forEach(function (v) { if (v !== null) peak = Math.max(peak, v); });
    var scale = Math.max(peak, 0.25);
    vals.forEach(function (v, i) {
      var bh = v ? Math.max(3, v / scale * (H - 12)) : 0;
      bars += '<rect class="wx-rb" data-wx-css="animation-delay:' + (i * 0.03).toFixed(2) + 's" x="' + (i * (W / n) + 2).toFixed(1) + '" y="' + (H - bh).toFixed(1) + '" width="' + Math.max(1, W / n - 4).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="3" fill="#3d93e0"/>';
    });
    return '<svg class="wx-chart wx-chart-rain" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Rain per hour over the last 24 hours">' + bars +
      '<line x1="0" y1="' + (H - 0.5) + '" x2="' + W + '" y2="' + (H - 0.5) + '" stroke="currentColor" stroke-opacity=".15"/></svg>';
  }
  function compassSvg(n) {
    var t = '';
    for (var i = 0; i < 36; i++) {
      var a = i * Math.PI / 18, r1 = i % 9 === 0 ? 56 : 61;
      t += '<line x1="' + (75 + Math.sin(a) * r1).toFixed(1) + '" y1="' + (75 - Math.cos(a) * r1).toFixed(1) + '" x2="' + (75 + Math.sin(a) * 66).toFixed(1) + '" y2="' + (75 - Math.cos(a) * 66).toFixed(1) + '" stroke="currentColor" stroke-opacity="' + (i % 9 === 0 ? '.55' : '.2') + '" stroke-width="1.5"/>';
    }
    function lbl(x, y, s) { return '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">' + s + '</text>'; }
    return '<svg class="wx-compass" viewBox="0 0 150 150" role="img" aria-label="' + esc(n.dir === null ? 'Wind direction unavailable' : 'Wind from the ' + compass(n.dir) + ' at ' + fmt(n.wind) + ' miles per hour') + '">' + t +
      lbl(75, 12, 'N') + lbl(144, 79, 'E') + lbl(75, 148, 'S') + lbl(6, 79, 'W') +
      (n.dir === null ? '' : '<g class="wx-needle" data-wx-rot="' + Math.round(n.dir) + '"><g class="wx-wobble"><path d="M75 22 L83 75 L75 70 L67 75 Z" fill="#2f86d6"/><path d="M75 128 L81 80 L75 84 L69 80 Z" fill="currentColor" opacity=".25"/></g></g>') +
      '<circle cx="75" cy="75" r="20" fill="currentColor" fill-opacity=".06"/><text x="75" y="74" text-anchor="middle" font-size="17" font-weight="600" fill="currentColor">' + fmt(n.wind) + '</text>' +
      '<text x="75" y="88" text-anchor="middle" font-size="9.5" fill="currentColor" opacity=".7">mph</text></svg>';
  }
  function kv(label, value) { return '<div class="wx-kv"><span>' + esc(label) + '</span><span>' + esc(value) + '</span></div>'; }
  function hourlyHtml(d) {
    if (!d.hourly.length) return '';
    return '<div class="wx-hourly" aria-label="Next hours">' + d.hourly.map(function (h, i) {
      return '<div class="wx-hour' + (i === 0 ? ' wx-now' : '') + '"><div>' + esc(i === 0 ? 'Now' : hourLabel(h.t)) + '</div>' + icon(h.cond, h.isDay) +
        '<div><b>' + deg(h.temp) + '</b></div><div class="wx-pop">' + (h.pop ? Math.round(h.pop) + '%' : '') + '</div></div>';
    }).join('') + '</div>';
  }
  function dailyHtml(d) {
    if (!d.daily.length) return '<p class="wx-muted wx-small">Forecast unavailable.</p>';
    var lo0 = Infinity, hi0 = -Infinity;
    d.daily.forEach(function (x) { lo0 = Math.min(lo0, x.lo); hi0 = Math.max(hi0, x.hi); });
    var span = (hi0 - lo0) || 1;
    return d.daily.map(function (x, i) {
      return '<div class="wx-day"><b>' + esc(dayLabel(x.date, i)) + '</b>' + icon(x.cond === 'night' ? 'sunny' : x.cond, true) +
        '<span class="wx-pop">' + (x.pop ? Math.round(x.pop) + '%' : '') + '</span><span class="wx-lo">' + deg(x.lo) + '</span>' +
        '<span class="wx-rng"><i data-wx-css="left:' + ((x.lo - lo0) / span * 100).toFixed(1) + '%|width:' + Math.max(4, (x.hi - x.lo) / span * 100).toFixed(1) + '%"></i></span>' +
        '<span><b>' + deg(x.hi) + '</b></span></div>';
    }).join('');
  }

  function pageHtml(d) {
    var n = d.now, state = ageState(d), q = d.aqi ? AQI[d.aqi] : null;
    var head = '<h2 class="wx-h2">Right now</h2>';
    var sub = [];
    if (n.feels !== null) sub.push('Feels like ' + deg(n.feels));
    if (d.today.hi !== null) sub.push('High ' + deg(d.today.hi));
    if (d.today.lo !== null) sub.push('Low ' + deg(d.today.lo));
    var hero = '<div class="wx-sky wx-hero ' + (state === 'offline' ? 'wx-sky-offline' : skyClass(d)) + '">' + (state === 'offline' ? '' : skyLayers(d)) + '<div class="wx-in"><div class="wx-row">' +
      '<div class="wx-icon">' + icon(n.cond, n.isDay) + '</div>' +
      '<div><div class="wx-temp"><span class="wx-t">' + fmt(n.temp) + '</span><sup>°F</sup></div><div class="wx-cond">' + esc(n.label) + '</div>' +
      '<div class="wx-sub">' + esc(sub.join(' · ')) + '</div></div>' +
      '<div class="wx-side-note">' + esc(d.place) + '<br><span class="wx-live' + (state !== 'live' ? ' wx-live-stale' : '') + '"></span>' +
      '<span class="wx-ago" data-wx-epoch="' + d.observed + '">' + esc(state === 'offline' ? 'Station offline, last reading ' + ago(d.observed) : 'Updated ' + ago(d.observed)) + '</span></div></div>' +
      hourlyHtml(d) + '</div></div>';

    var dewTxt = n.dew === null ? '–' : deg(n.dew);
    var pressTxt = n.pressure === null ? '–' : n.pressure.toFixed(2) + ' inHg' + (n.trend ? ', ' + n.trend : '');
    var aqiSeg = '';
    for (var k = 1; k <= 6; k++) aqiSeg += '<i class="wx-aqi-' + k + (k === d.aqi ? ' wx-on' : '') + '"></i>';
    var tiles1 =
      '<div class="wx-tile"><h4>Wind</h4>' + compassSvg(n) + kv('From', n.dir === null ? '–' : compass(n.dir) + ' (' + Math.round(n.dir) + '°)') + kv('Gusts', fmt(n.gust) + ' mph') + '</div>' +
      '<div class="wx-tile"><h4>Comfort</h4><div class="wx-big">' + fmt(n.humidity) + '%</div><div class="wx-muted wx-small">humidity</div>' +
        '<div class="wx-bar wx-hum"><i data-wx-w="' + (n.humidity || 0) + '"></i></div>' + kv('Dew point', dewTxt) + kv('Feels like', deg(n.feels)) + kv('Pressure', pressTxt) + '</div>' +
      '<div class="wx-tile"><h4>UV index</h4><div class="wx-big">' + fmt(n.uv) + ' <span class="wx-muted wx-word">' + esc(uvWord(n.uv)) + '</span></div>' +
        '<div class="wx-bar wx-uv"><i data-wx-w="' + Math.min(100, (n.uv || 0) / 11 * 100).toFixed(0) + '"></i></div>' +
        kv('Sunlight', n.solar === null ? '–' : Math.round(n.solar) + ' W/m²') +
        kv('Sunrise', d.today.sunrise ? clock(d.today.sunrise) : '–') + kv('Sunset', d.today.sunset ? clock(d.today.sunset) : '–') + '</div>' +
      '<div class="wx-tile"><h4>Air quality</h4><div class="wx-big wx-big-word">' + esc(q ? q.name : 'Unavailable') + '</div>' +
        (q ? '<div class="wx-muted wx-small">US EPA category ' + d.aqi + ' of 6</div>' : '') +
        '<div class="wx-aqi">' + aqiSeg + '</div><div class="wx-aqi-lbl"><span>Good</span><span>Hazardous</span></div></div>' +
      '<div class="wx-tile"><h4>Rain</h4><div class="wx-big">' + fmt(n.rainToday, 2) + ' in</div><div class="wx-muted wx-small">today</div>' + rainChart(d.history.rain) +
        kv('Yesterday', d.rain.yesterday === null ? '–' : d.rain.yesterday.toFixed(2) + ' in') + kv('This month', d.rain.month === null ? '–' : d.rain.month.toFixed(2) + ' in') + '</div>' +
      '<div class="wx-tile"><h4>Lightning, last 3 hours</h4><div class="wx-big">' + fmt(n.strikes) + '</div><div class="wx-muted wx-small">strikes detected</div>' +
        kv('Closest', n.strikes && n.closest !== null ? 'about ' + Math.round(n.closest) + ' mi' : 'none') +
        kv('Last strike', n.strikes && n.lastStrike ? ago(n.lastStrike) : '–') + '</div>' +
      moonTile();

    return '<p class="wx-intro">The weather in my backyard in Brandon, Florida, measured by my own Tempest weather station.</p>' +
      head + hero +
      '<h2 class="wx-h2">Today’s details</h2><div class="wx-grid">' + tiles1 + '</div>' +
      '<h2 class="wx-h2">The last 24 hours</h2><div class="wx-grid"><div class="wx-tile wx-wide"><h4>Temperature</h4>' + tempChart(d.history.temp) +
        '<h4 class="wx-h4-gap">Pressure</h4>' + pressureChart(d.history.pressure) + '</div></div>' +
      '<h2 class="wx-h2">The next 5 days</h2><div class="wx-grid"><div class="wx-tile wx-wide"><h4>Forecast</h4><div class="wx-days">' + dailyHtml(d) + '</div></div></div>' +
      '<h2 class="wx-h2">About this station</h2><div class="wx-grid"><div class="wx-tile wx-wide wx-about"><h4>Where this comes from</h4>' +
        'These readings come from a Tempest weather station at my home in Brandon, Florida, updated every 5 minutes. ' +
        'Temperature, humidity, wind, pressure, rain, sunlight and lightning are measured here. The forecast, UV index and air quality come from ' +
        '<a href="https://www.weatherapi.com/" rel="noopener" target="_blank">WeatherAPI.com</a>.<ul>' +
        '<li>To protect my privacy, this page never shows my address, map position, or any station identifiers.</li>' +
        '<li>Sunrise and sunset are for Brandon in general.</li>' +
        '<li>The moon phase is calculated on this page. The moon pictures are drawn from a public-domain photo by NASA’s Lunar Reconnaissance Orbiter (NASA/GSFC/Arizona State University).</li>' +
        '<li>No cookies and no tracking.</li></ul></div></div>';
  }

  /* ---------------- mount ---------------- */
  var firstRender = true;

  function finishRender(scope, d) {
    applyCss(scope);
    if (firstRender) {
      scope.classList.add('wx-animate');
      var temps = scope.querySelectorAll('.wx-t');
      for (var i = 0; i < temps.length; i++) countUp(temps[i], d.now.temp);
    }
    var tiles = scope.querySelectorAll('.wx-tile');
    for (var t = 0; t < tiles.length; t++) tiles[t].style.setProperty('animation-delay', (t * 0.07).toFixed(2) + 's');
    var later = function () {
      var needle = scope.querySelector('.wx-needle');
      if (needle) needle.style.setProperty('transform', 'rotate(' + needle.getAttribute('data-wx-rot') + 'deg)');
      var bars = scope.querySelectorAll('[data-wx-w]');
      for (var b = 0; b < bars.length; b++) bars[b].style.setProperty('width', Math.max(0, Math.min(100, Number(bars[b].getAttribute('data-wx-w')) || 0)) + '%');
    };
    if (root.requestAnimationFrame) root.requestAnimationFrame(function () { root.requestAnimationFrame(later); }); else later();
  }

  function placeSide(doc) {
    var side = doc.querySelector('.wx-side');
    if (!side) return;
    if (doc.body.classList.contains('weather-theme-page')) { side.parentNode.removeChild(side); return; }
    var overlord = doc.getElementById('overlord');
    if (overlord && side.parentNode !== overlord) overlord.appendChild(side);
    if (!overlord) side.classList.add('wx-side-free');
  }
  function sideFits(doc) {
    var side = doc.querySelector('.wx-side');
    if (!side) return false;
    side.classList.add('wx-measuring');
    var visible = side.offsetParent !== null || (root.getComputedStyle && root.getComputedStyle(side).position === 'fixed');
    var rect = side.getBoundingClientRect();
    side.classList.remove('wx-measuring');
    if (!visible || rect.width === 0) return false;
    // Leftmost edge of the page's real content: blocks up to three levels deep that are wider than
    // 200px but not full-width wrappers (a centered full-width header would otherwise read as left 0).
    var main = doc.getElementById('main-content'), contentLeft = Infinity;
    var vw = doc.documentElement.clientWidth || root.innerWidth || 0;
    if (main) {
      var kids = main.querySelectorAll(':scope > *, :scope > * > *, :scope > * > * > *');
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].closest('.wx-side') || kids[i].closest('#overlord')) continue;
        var r = kids[i].getBoundingClientRect();
        if (r.width > 200 && r.width < vw * 0.85 && r.height > 0) contentLeft = Math.min(contentLeft, r.left);
      }
    }
    return contentLeft !== Infinity && rect.right + 24 <= contentLeft;
  }
  function chooseSlots(doc) {
    var ok = sideFits(doc);
    doc.documentElement.classList.toggle('wx-side-on', ok);
  }

  function render(doc, d) {
    var slots = doc.querySelectorAll('.wx-slot');
    for (var i = 0; i < slots.length; i++) {
      slots[i].innerHTML = d ? widgetHtml(d) : '';
      slots[i].classList.toggle('wx-empty', !d);
      if (d) finishRender(slots[i], d);
    }
    var page = doc.getElementById('wx-page');
    if (page) {
      var body = doc.body, sky = !d ? 'offline' : ageState(d) === 'offline' ? 'offline' : skyClass(d).replace('wx-sky-', '');
      var old = (body.className.match(/\bwx-page-sky-[a-z]+\b/g) || []);
      for (var o = 0; o < old.length; o++) body.classList.remove(old[o]);
      body.classList.add('wx-page-sky-' + sky);
      if (d) { page.innerHTML = pageHtml(d); finishRender(page, d); }
      else page.innerHTML = '<p class="wx-intro">Weather data is unavailable right now. Please check back in a few minutes.</p>';
    }
    firstRender = false;
  }
  function tickAgo(doc) {
    var els = doc.querySelectorAll('.wx-ago[data-wx-epoch]');
    for (var i = 0; i < els.length; i++) {
      var e = Number(els[i].getAttribute('data-wx-epoch'));
      if (isFinite(e) && els[i].textContent.indexOf('Updated') === 0) els[i].textContent = 'Updated ' + ago(e);
    }
  }
  function load(doc) {
    return root.fetch(ENDPOINT, { credentials: 'omit', cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (raw) { return normalize(raw); })
      .catch(function () { return null; })
      .then(function (d) { render(doc, d); chooseSlots(doc); return d; });
  }
  function init() {
    var doc = root.document;
    if (!doc.querySelector('.wx-slot') && !doc.getElementById('wx-page')) return;
    placeSide(doc);
    load(doc);
    root.setInterval(function () { load(doc); }, REFRESH_MS);
    root.setInterval(function () { tickAgo(doc); }, 60 * 1000);
    var t = null;
    root.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { chooseSlots(doc); }, 150); });
  }

  root.MichaelWeather = { normalize: normalize, esc: esc, toNum: toNum, widgetHtml: widgetHtml, pageHtml: pageHtml, moonInfo: moonInfo };
  if (root.document && root.fetch) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window !== 'undefined' ? window : this);

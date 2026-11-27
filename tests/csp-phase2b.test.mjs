// JOURNAL-CSP-01 Phase 2b, part A: the 2b gate, the preview step, the inline inventory, D4, D6.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { checkHeaders, headerLines } from '../tools/csp-headers-check.mjs';
import { FIXTURES, fixtureHeaders, isPreview, previewBaseUrl, run as runPreview } from '../tools/csp-preview.mjs';
import { emit, inventoryOf, pagePath, policyHosts, readInventory, routeKey, scanPage, unlisted } from '../tools/csp-inline-inventory.mjs';
import { validMeta, validPositions, validRoutes } from '../functions/_shared/csp-report-core.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const fixturePolicies = () => Object.fromEntries(Object.entries(FIXTURES).map(([n, f]) => [n, read(f.policyFile)]));

const POL = "default-src 'self'; script-src 'self' 'unsafe-inline'\n";
const RO = "default-src 'self'; script-src 'self' 'report-sample'\n";
const FX = { legacy: "default-src 'none'; report-uri /api/csp-report\n", modern: "default-src 'none'; report-to csp\n" };
const OK = "/*\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'\n"
  + "  Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'report-sample'\n"
  + '  Reporting-Endpoints: csp="/api/csp-report"\n';
const FIX = '/__csp-fixture/legacy/*\n  ! Content-Security-Policy\n  ! Content-Security-Policy-Report-Only\n  ! Reporting-Endpoints\n'
  + "  Content-Security-Policy: default-src 'none'; report-uri /api/csp-report\n"
  + '/__csp-fixture/modern/*\n  ! Content-Security-Policy\n  ! Content-Security-Policy-Report-Only\n  ! Reporting-Endpoints\n'
  + "  Content-Security-Policy: default-src 'none'; report-to csp\n  Reporting-Endpoints: csp=\"/api/csp-report\"\n";
const o = (extra = {}) => ({ reportOnlyPolicyText: RO, preview: false, fixturePolicies: FX, ...extra });

test('2b gate: accepts the production shape, and the preview shape only in preview', () => {
  assert.deepEqual(checkHeaders(OK, '2b-enforce', POL, o()), []);
  assert.deepEqual(checkHeaders(OK + FIX, '2b-enforce', POL, o({ preview: true })), []);
  assert.deepEqual(checkHeaders(OK.toLowerCase().replace("'self'", "'self'"), '2b-enforce', POL.toLowerCase(), o({ reportOnlyPolicyText: RO.toLowerCase() })), [],
    'header names are case-insensitive');
});

test('2b gate: refuses every mismatch', () => {
  const refuse = (text, label, pattern, extra = {}, policy = POL) => {
    const problems = checkHeaders(text, '2b-enforce', policy, o(extra));
    assert.ok(problems.some((p) => pattern.test(p)), `${label}: ${problems.join(' | ') || 'no problem found'}`);
  };
  refuse(OK + FIX, 'fixtures in production', /preview-only/);
  refuse(OK, 'preview without fixtures', /missing \/__csp-fixture/, { preview: true });
  refuse(FIX + OK, 'fixtures before the catch-all', /must come after/, { preview: true });
  refuse(OK + FIX.replace('  ! Reporting-Endpoints\n', ''), 'fixture keeps inherited Reporting-Endpoints', /detach reporting-endpoints/, { preview: true });
  refuse(OK + FIX.replace('report-uri /api/csp-report\n/__csp', 'report-uri /x\n/__csp'), 'fixture policy differs', /differs/, { preview: true });
  refuse(OK + FIX.replace('  Reporting-Endpoints: csp="/api/csp-report"\n', ''), 'modern fixture without endpoints', /reporting-endpoints line, found 0/, { preview: true });
  refuse(OK + FIX.replace("report-uri /api/csp-report\n/__csp", "report-uri /api/csp-report\n  Reporting-Endpoints: csp=\"/api/csp-report\"\n/__csp"),
    'legacy fixture with endpoints', /must not set reporting-endpoints/, { preview: true });
  refuse(OK.replace(/  Content-Security-Policy: [^\n]*\n/, ''), 'no enforcing line', /content-security-policy line, found 0/);
  refuse(OK.replace(/  Content-Security-Policy-Report-Only: [^\n]*\n/, ''), 'no Report-Only line', /report-only line, found 0/);
  refuse(OK.replace(/  Reporting-Endpoints: [^\n]*\n/, ''), 'no Reporting-Endpoints', /reporting-endpoints line, found 0/);
  refuse(OK + "  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'\n", 'two enforcing lines', /found 2/);
  refuse(OK.replace('csp="/api/csp-report"', 'csp="https://evil.example/r"'), 'endpoint elsewhere', /differs/);
  refuse(OK.replace("'report-sample'\n", "'report-sample' https:\n"), 'Report-Only value differs', /differs/);
  refuse(OK + "/blog/*\n  Content-Security-Policy: default-src 'self'\n", 'another path sets CSP', /\/blog\/\* sets/);
  refuse(OK + '/blog/*\n  ! Content-Security-Policy\n', 'another path detaches CSP', /\/blog\/\* sets or detaches/);
  refuse(OK + '  ! Content-Security-Policy\n', 'the catch-all detaches', /must not detach/);
  refuse(OK, 'same policy twice', /must differ/, { reportOnlyPolicyText: POL });
  refuse(OK, 'missing Report-Only policy file', /report-only policy file is missing/, { reportOnlyPolicyText: null });
  refuse(OK, 'duplicate directive', /twice/, {}, "default-src 'self'; default-src 'none'\n");
  assert.deepEqual(checkHeaders(null, '2b-enforce', POL, o()), ['public/_headers is missing']);
});

test('preview step: fails closed on the base URL and never touches production output', () => {
  assert.equal(isPreview({}), false);
  assert.equal(isPreview({ CF_PAGES_BRANCH: 'master' }), false);
  assert.equal(isPreview({ CF_PAGES_BRANCH: 'feat/csp-phase2b' }), true);
  assert.equal(previewBaseUrl({ CF_PAGES_URL: 'https://5a069367.michaels-journal.pages.dev' }), 'https://5a069367.michaels-journal.pages.dev');
  for (const bad of ['', 'https://michaelreflects.com', 'http://5a069367.michaels-journal.pages.dev',
    'https://x.michaels-journal.pages.dev.evil.example', 'https://x.other-project.pages.dev', 'https://a.b.michaels-journal.pages.dev',
    'https://michaels-journal.pages.dev']) {
    assert.throws(() => previewBaseUrl({ CF_PAGES_URL: bad }), /needs CF_PAGES_URL/, bad);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-preview-'));
  try {
    fs.mkdirSync(path.join(tmp, 'public'));
    fs.writeFileSync(path.join(tmp, 'public', '_headers'), 'untouched');
    assert.deepEqual(runPreview('/no/zola', { root: tmp, env: { CF_PAGES_BRANCH: 'master' } }), { mode: 'production' });
    assert.deepEqual(runPreview('/no/zola', { root: tmp, env: {} }), { mode: 'production' });
    assert.equal(fs.readFileSync(path.join(tmp, 'public', '_headers'), 'utf8'), 'untouched');
    assert.throws(() => runPreview('/no/zola', { root: tmp, env: { CF_PAGES_BRANCH: 'x', CF_PAGES_URL: 'https://michaelreflects.com' } }), /needs CF_PAGES_URL/);
    fs.mkdirSync(path.join(tmp, 'public', '__csp-fixture'));
    assert.throws(() => runPreview('/no/zola', { root: tmp, env: {} }), /must not contain/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('preview step: the appended fixture block passes the real gate in preview and fails it in production', () => {
  const headers = read('static/_headers') + fixtureHeaders(root);
  const opts = (preview) => ({ reportOnlyPolicyText: read('csp/phase3-report-only.policy'), preview, fixturePolicies: fixturePolicies() });
  assert.deepEqual(checkHeaders(headers, '2b-enforce', read('csp/phase2.policy'), opts(true)), []);
  assert.ok(checkHeaders(headers, '2b-enforce', read('csp/phase2.policy'), opts(false)).some((p) => /preview-only/.test(p)));
  assert.equal(headerLines(fixtureHeaders(root)).filter((h) => h.detach).length, 6);
});

test('inventory: scanPage identifies template, content and handler code with positions', () => {
  const html = '<html>\n<body onload="main();">\n<script data-csp-id="base.1">a()</script>\n'
    + '<script>b()</script><script src="/x.js"></script>\n<script type="application/ld+json">{}</script>\n'
    + "<button onclick='go()'>x</button>\n</body></html>";
  const items = scanPage(html);
  assert.deepEqual(items.map((i) => [i.id.replace(/:[0-9a-f]+$/, ':H'), i.kind, i.line]), [
    ['handler:body.onload:H', 'handler', 2],
    ['base.1', 'script', 3],
    ['content:H', 'script', 4],
    ['handler:button.onclick:H', 'handler', 6],
  ]);
  assert.equal(pagePath('/p', path.join('/p', 'index.html')), '/');
  assert.equal(pagePath('/p', path.join('/p', 'blog', 'x', 'index.html')), '/blog/x/');
  assert.equal(pagePath('/p', path.join('/p', '404.html')), '/404.html');
  assert.deepEqual(policyHosts("img-src 'self' https://a.example https://*.b.example; connect-src wss://c.example data:"),
    ['*.b.example', 'a.example', 'c.example']);
  assert.equal(routeKey('/'), routeKey('/'));
  assert.notEqual(routeKey('/a/'), routeKey('/b/'));
  const redirect = '<script>\nwindow.location.replace("/");\n</script>';
  assert.equal(scanPage(redirect)[0].id, scanPage(redirect.replaceAll('\n', '\r\n'))[0].id);
});

test('inventory: every template inline script is tagged with data-csp-id', () => {
  const dirs = ['templates', 'themes/ergo/templates'];
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const rel = path.join(d, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.html')) {
        const text = read(rel);
        // A real tag: "<script>" or "<script " + attributes (not the "<script[ >]" text in
        // base.html's summary regex).
        for (const m of text.matchAll(/<script(\s[^>]*)?>/g)) {
          if (/\bsrc\s*=|application\/(ld\+)?json|data-csp-id=/.test(m[1] ?? '')) continue;
          offenders.push(`${rel}: ${m[0]}`);
        }
      }
    }
  };
  dirs.forEach(walk);
  assert.deepEqual(offenders, []);
  const ids = new Set();
  for (const d of dirs) {
    const out = spawnSync('git', ['grep', '-h', '-o', 'data-csp-id="[a-z0-9.-]*"', '--', d], { cwd: root, encoding: 'utf8' });
    for (const id of out.stdout.split('\n').filter(Boolean)) {
      assert.ok(!ids.has(id), `duplicate ${id}`);
      ids.add(id);
    }
  }
});

test('inventory: the real build has no unlisted inline code, and emit writes the collector data', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-inventory-'));
  try {
    const built = spawnSync('zola', ['build', '-o', out, '--force'], { cwd: root, encoding: 'utf8' });
    if (built.error) throw built.error;
    assert.equal(built.status, 0, built.stderr || 'Zola build failed');
    const inventory = readInventory(path.join(root, 'csp/phase3-inline-inventory.json'));
    assert.deepEqual(unlisted(out, inventory), [], 'add new inline code with: node tools/csp-inline-inventory.mjs write <build>');
    const { pages } = inventoryOf(out);
    assert.ok(pages.length > 1000);
    const r = emit(out, { root, env: {} });
    assert.equal(r.mode, 'production');
    const meta = JSON.parse(fs.readFileSync(path.join(out, '__csp', 'meta.json'), 'utf8'));
    assert.deepEqual(Object.keys(meta.policies), ['enforce-2b', 'ro-phase3'], 'production carries no fixture policy');
    assert.equal(meta.preview_host, null);
    assert.ok(meta.hosts.includes('tinylytics.app') && !meta.hosts.some((h) => h.includes('/')));
    const routes = JSON.parse(fs.readFileSync(path.join(out, '__csp', 'routes.json'), 'utf8'));
    assert.ok(routes.includes('/') && routes.includes('/about/'));
    const posOf = (route) => JSON.parse(fs.readFileSync(path.join(out, '__csp', 'pos', `${routeKey(route)}.json`), 'utf8'));
    const scanOf = (route) => scanPage(fs.readFileSync(path.join(out, ...route.split('/').filter(Boolean), 'index.html'), 'utf8'));
    // Every page gets a position file listing exactly the inline items on the built page. Phase 3
    // steps 2 and 3 emptied the home page, so its file is checked as written (possibly []), and
    // the "positions are real" check uses a page that still has inline code: the example page of
    // an item still in the inventory. Once the inventory is empty (step 6) there is none to pick.
    const home = posOf('/');
    assert.deepEqual(home.map(([id]) => id), scanOf('/').map((i) => i.id));
    const examples = [...new Set(Object.values(inventory.items).map((i) => i.example))].sort();
    const withCode = examples.find((route) => scanOf(route).length > 0);
    if (Object.keys(inventory.items).length > 0) {
      assert.ok(withCode, 'an inventory example page still has inline code');
      const found = scanOf(withCode);
      const pos = posOf(withCode);
      assert.deepEqual(pos.map(([id]) => id), found.map((i) => i.id));
      assert.deepEqual(pos.map(([, line, col, end]) => [line, col, end]), found.map((i) => [i.line, i.col, i.endLine]));
      assert.ok(validPositions(pos));
    }
    // What the build writes must pass the collector's own validators, or the collector would 503 forever.
    assert.ok(validMeta(meta), 'production meta.json passes validMeta');
    assert.ok(validRoutes(routes) && validPositions(home));
    const p = emit(out, { root, env: { CF_PAGES_BRANCH: 'feat/x', CF_PAGES_URL: 'https://abc12345.michaels-journal.pages.dev' } });
    assert.equal(p.mode, 'preview');
    const pmeta = JSON.parse(fs.readFileSync(path.join(out, '__csp', 'meta.json'), 'utf8'));
    assert.equal(pmeta.preview_host, 'abc12345.michaels-journal.pages.dev');
    assert.ok(validMeta(pmeta), 'preview meta.json passes validMeta');
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('D4: failed webmention avatars fall back to the initial badge without an inline handler', () => {
  const partial = read('themes/ergo/templates/partials/webmentions.html');
  assert.match(partial, /list\.addEventListener\("error", function \(event\) \{/);
  assert.match(partial, /\}, true\);/, 'capturing listener: error events do not bubble');
  assert.match(partial, /data-initial='" \+ escapeHtml\(initialFor\(mention\)\) \+ "'/);
  assert.doesNotMatch(partial, /onerror\s*=/);
});

test('D6: weather.json sends its own CSP; no Function returns HTML without one', () => {
  assert.match(read('functions/weather.json.js'), /'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"/);
  const files = spawnSync('git', ['ls-files', 'functions'], { cwd: root, encoding: 'utf8' }).stdout.split('\n').filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const text = read(f);
    if (/text\/html/.test(text)) assert.match(text, /Content-Security-Policy/, `${f} returns HTML, so it needs a CSP`);
  }
});

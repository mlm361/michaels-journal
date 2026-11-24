import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { checkHeaders, cspLines, headerLines, policyProblems } from '../tools/csp-headers-check.mjs';
import { FIXTURES, fixtureHeaders, isPreview, previewBaseUrl, run as runPreview } from '../tools/csp-preview.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const DECLARED = 'CSP_PHASE=2b-enforce';
const PREVIEW = 'node tools/csp-preview.mjs "$zola_dir/zola"';
const EMIT = 'node tools/csp-inline-inventory.mjs emit public';
const GATE = 'node tools/csp-headers-check.mjs "$CSP_PHASE" public/_headers csp/phase2.policy csp/phase3-report-only.policy';

test('JOURNAL-CSP-01: pages-build.sh runs the recorded baseline command, unchanged, then the gate', () => {
  const doc = read('docs/csp/phase0-baseline.md');
  const block = doc.match(/<!-- baseline-command -->\s*```sh\n([^\n]+)\n```/);
  assert.ok(block, 'baseline command block not found');
  const baseline = block[1].split('; ');
  assert.equal(baseline[0], 'set -eu');
  const script = read('tools/pages-build.sh');
  assert.doesNotMatch(script, /\r/, 'pages-build.sh must use LF line endings');
  const lines = script.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  assert.equal(lines[0], 'set -euo pipefail');
  // Every baseline command appears as its own line, in the same order.
  let at = 0;
  for (const command of baseline.slice(1)) {
    const found = lines.indexOf(command, at);
    assert.notEqual(found, -1, `baseline command missing or out of order: ${command}`);
    at = found + 1;
  }
  // Nothing else runs before or between them, apart from the phase declaration.
  const extra = lines.filter((l) => !baseline.includes(l));
  assert.deepEqual(extra, ['set -euo pipefail', DECLARED, PREVIEW, EMIT, GATE]);
  // After the baseline build: the preview step, the collector data, then the gate last, with no
  // condition around any of them (the preview tool decides inside, and fails closed).
  assert.deepEqual(lines.slice(-4), ['"$zola_dir/zola" build', PREVIEW, EMIT, GATE]);
  for (const l of lines) assert.doesNotMatch(l, /^(if|\[|test)\b|\|\||&&/, `no conditional or skip path: ${l}`);
});

const opts = (extra = {}) => ({
  reportOnlyPolicyText: read('csp/phase3-report-only.policy'),
  preview: false,
  fixturePolicies: Object.fromEntries(Object.entries(FIXTURES).map(([n, f]) => [n, read(f.policyFile)])),
  ...extra,
});

test('JOURNAL-CSP-01 Phase 2b: the committed _headers and policies pass 2b-enforce and fail 2a and none', () => {
  const headers = read('static/_headers');
  const policy = read('csp/phase2.policy');
  assert.deepEqual(checkHeaders(headers, '2b-enforce', policy, opts()), []);
  assert.deepEqual(cspLines(headers).map((l) => [l.path, l.name]), [
    ['/*', 'content-security-policy'], ['/*', 'content-security-policy-report-only'],
  ]);
  assert.ok(checkHeaders(headers, '2a-report-only', policy).length >= 1, 'the 2a rule must refuse a 2b file');
  assert.equal(checkHeaders(headers, 'none').length, 2, 'the none rule must refuse a 2b file');
});

test('JOURNAL-CSP-01 Phase 2b: enforced and Report-Only policies differ only as planned', () => {
  const enforce = read('csp/phase2.policy').trimEnd().split('; ');
  const ro = read('csp/phase3-report-only.policy').trimEnd().split('; ');
  assert.equal(ro.length, enforce.length);
  const differing = enforce.map((d, i) => [d, ro[i]]).filter(([a, b]) => a !== b);
  assert.equal(differing.length, 1, 'only script-src differs');
  const [e, r] = differing[0];
  assert.match(e, /^script-src 'self' 'unsafe-inline' /);
  assert.equal(r, e.replace(" 'unsafe-inline'", " 'report-sample'"));
  for (const p of [enforce, ro]) {
    assert.ok(p.includes("worker-src 'self' blob:"), 'TownSquare needs a blob: worker (D2)');
    assert.ok(p.includes('report-uri /api/csp-report') && p.includes('report-to csp'), 'both reporting mechanisms (v3 D3)');
    assert.ok(!p.find((d) => d.startsWith('connect-src ')).includes('cloudflareinsights'),
      'v2 research: the auto-injected beacon posts to /cdn-cgi/rum, so no connect-src host for it');
  }
});

for (const file of ['csp/phase2.policy', 'csp/phase3-report-only.policy']) test(`JOURNAL-CSP-01: ${file} keeps its baseline protections`, () => {
  const policy = read(file);
  assert.deepEqual(policyProblems(policy), []);
  assert.doesNotMatch(policy, /\r/);
  const directives = new Map(policy.trimEnd().split('; ').map((d) => {
    const [name, ...sources] = d.split(' ');
    return [name, sources];
  }));
  assert.deepEqual(directives.get('default-src'), ["'self'"]);
  assert.deepEqual(directives.get('object-src'), ["'none'"]);
  assert.deepEqual(directives.get('base-uri'), ["'self'"]);
  assert.deepEqual(directives.get('form-action'), ["'self'"]);
  assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(directives.get('font-src'), ["'self'"]);
  for (const [name, sources] of directives) {
    assert.ok(!sources.includes("'unsafe-eval'"), `${name} must not allow eval`);
    for (const s of sources) {
      assert.ok(!/^(https?:|wss?:|\*|data:)$/.test(s) || (s === 'data:' && name === 'img-src'),
        `${name} must list hosts, not a whole scheme: ${s}`);
      assert.ok(!/^http:\/\//.test(s), `${name} must not allow plain http: ${s}`);
    }
  }
  // Hosts removed by Phase 1 stay out.
  for (const gone of ['kit.fontawesome.com', 'cdn.simpleicons.org', 'cdn.jsdelivr.net']) {
    assert.ok(!policy.includes(gone), `${gone} was removed in Phase 1`);
  }
});

test('JOURNAL-CSP-01 Phase 2a: the 2a gate refuses every mismatch', () => {
  const policy = "default-src 'self'; img-src 'self'\n";
  const ok = `/*\n  X-Frame-Options: DENY\n  Content-Security-Policy-Report-Only: default-src 'self'; img-src 'self'\n`;
  assert.deepEqual(checkHeaders(ok, '2a-report-only', policy), []);
  assert.deepEqual(checkHeaders(ok.replace('Content-Security-Policy-Report-Only', 'content-security-policy-report-only'),
    '2a-report-only', policy), [], 'header names are case-insensitive');
  const refuse = (text, pol, pattern, label) => {
    const problems = checkHeaders(text, '2a-report-only', pol);
    assert.ok(problems.length >= 1, `${label}: expected a problem`);
    assert.ok(problems.some((p) => pattern.test(p)), `${label}: ${problems.join(' | ')}`);
  };
  refuse('/*\n  X-Frame-Options: DENY\n', policy, /exactly one .* found 0/, 'no Report-Only line');
  refuse(ok + "/blog/*\n  Content-Security-Policy-Report-Only: default-src 'self'; img-src 'self'\n", policy,
    /found 2/, 'two Report-Only lines');
  refuse(ok.replace('/*', '/blog/*'), policy, /not \/\*/, 'Report-Only for another path');
  refuse(ok.replace("img-src 'self'\n", "img-src 'self' https:\n"), policy, /differs from the policy file/, 'value differs');
  refuse(ok + "  Content-Security-Policy: default-src 'self'\n", policy, /enforcing/, 'an enforcing line as well');
  refuse(ok.replace('Content-Security-Policy-Report-Only', 'Content-Security-Policy'), policy, /enforcing/,
    'enforcing instead of Report-Only');
  refuse(ok, null, /policy file is missing/, 'missing policy file');
  refuse(ok, '', /policy file is empty/, 'empty policy file');
  refuse(ok, "default-src 'self';\nimg-src 'self'\n", /single line/, 'two-line policy file');
  refuse(ok, "default-src 'self'; default-src 'none'\n", /twice/, 'duplicate directive');
  // Sally 2a review: a duplicate right after a semicolon with no space, header bytes matching the policy.
  const dup = "default-src 'self';default-src 'none'; object-src 'none'";
  refuse(`/*\n  Content-Security-Policy-Report-Only: ${dup}\n`, dup + '\n', /names default-src twice/,
    'duplicate after a semicolon without a space');
  refuse(`/*\n  Content-Security-Policy-Report-Only: ${dup}\n`, dup + '\n', /exactly '; '/, 'noncanonical separator');
  const gap = "default-src 'self';img-src 'self'";
  refuse(`/*\n  Content-Security-Policy-Report-Only: ${gap}\n`, gap + '\n', /exactly '; '/, 'missing space after a semicolon');
  const empty = "default-src 'self'; ; img-src 'self'";
  refuse(`/*\n  Content-Security-Policy-Report-Only: ${empty}\n`, empty + '\n', /empty directive/, 'empty directive');
  assert.deepEqual(checkHeaders(null, '2a-report-only', policy), ['public/_headers is missing']);
});

test('JOURNAL-CSP-01: the none gate still refuses any CSP header; unknown phases are refused', () => {
  const base = '/*\n  X-Frame-Options: DENY\n';
  const cases = [
    '/*\n  Content-Security-Policy: default-src \'self\'\n',
    '/*\n  Content-Security-Policy-Report-Only: default-src \'self\'\n',
    '/*\n  content-security-policy: default-src \'self\'\n',
    '/*\r\n  X-Frame-Options: DENY\r\n  Content-Security-Policy: default-src \'self\'\r\n',
    base + '/blog/*\n  Content-Security-Policy: default-src \'self\'\n',
  ];
  for (const text of cases) {
    const problems = checkHeaders(text, 'none');
    assert.equal(problems.length, 1, text);
    assert.match(problems[0], /CSP_PHASE=none but line \d+ sets content-security-policy/);
  }
  assert.deepEqual(cspLines(base + '/x\n  ! Content-Security-Policy\n'), [], 'a detach line sets nothing');
  assert.deepEqual(checkHeaders(null, 'none'), ['public/_headers is missing']);
  for (const phase of ['', '2B-ENFORCE', '3-strict', 'NONE', '2A-REPORT-ONLY']) {
    assert.deepEqual(checkHeaders(base, phase), [`unknown CSP_PHASE "${phase}"`]);
  }
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { checkHeaders, cspLines, policyProblems } from '../tools/csp-headers-check.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const DECLARED = 'CSP_PHASE=2a-report-only';
const GATE = 'node tools/csp-headers-check.mjs "$CSP_PHASE" public/_headers csp/phase2.policy';

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
  assert.deepEqual(extra, ['set -euo pipefail', DECLARED, GATE]);
  // The gate is the last step, after the build, with no condition around it.
  assert.equal(lines.at(-1), GATE);
  assert.equal(lines.at(-2), '"$zola_dir/zola" build');
  for (const l of lines) assert.doesNotMatch(l, /^(if|\[|test)\b|\|\||&&/, `no conditional or skip path: ${l}`);
});

test('JOURNAL-CSP-01 Phase 2a: the committed _headers and policy pass 2a-report-only and fail none', () => {
  const headers = read('static/_headers');
  const policy = read('csp/phase2.policy');
  assert.deepEqual(checkHeaders(headers, '2a-report-only', policy), []);
  const lines = cspLines(headers);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].name, 'content-security-policy-report-only');
  assert.equal(lines[0].path, '/*');
  assert.equal(checkHeaders(headers, 'none').length, 1, 'the none rule must refuse a Phase 2a file');
});

test('JOURNAL-CSP-01 Phase 2a: the policy keeps its baseline protections', () => {
  const policy = read('csp/phase2.policy');
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
  for (const phase of ['', '2b-enforce', '3-strict', 'NONE', '2A-REPORT-ONLY']) {
    assert.deepEqual(checkHeaders(base, phase), [`unknown CSP_PHASE "${phase}"`]);
  }
});

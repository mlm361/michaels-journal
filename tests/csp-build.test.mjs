import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { checkHeaders, cspLines } from '../tools/csp-headers-check.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('JOURNAL-CSP-01 Phase 0: pages-build.sh runs the recorded baseline command, unchanged', () => {
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
  assert.deepEqual(extra, [
    'set -euo pipefail',
    'CSP_PHASE=none',
    'node tools/csp-headers-check.mjs "$CSP_PHASE" public/_headers',
  ]);
  // The gate is the last step, after the build, with no condition around it.
  assert.equal(lines.at(-1), 'node tools/csp-headers-check.mjs "$CSP_PHASE" public/_headers');
  assert.equal(lines.at(-2), '"$zola_dir/zola" build');
  for (const l of lines) assert.doesNotMatch(l, /^(if|\[|test)\b|\|\||&&/, `no conditional or skip path: ${l}`);
});

test('JOURNAL-CSP-01 Phase 0: the committed _headers passes CSP_PHASE=none', () => {
  const headers = read('static/_headers');
  // Its comments mention Content-Security-Policy-Report-Only; comments set nothing.
  assert.match(headers, /#.*Content-Security-Policy-Report-Only/);
  assert.deepEqual(checkHeaders(headers, 'none'), []);
});

test('JOURNAL-CSP-01 Phase 0: the none gate refuses any CSP header, a missing file and unknown phases', () => {
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
  for (const phase of ['', '2a-report-only', '2b-enforce', '3-strict', 'NONE']) {
    assert.deepEqual(checkHeaders(base, phase), [`unknown CSP_PHASE "${phase}"`]);
  }
});

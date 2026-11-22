// JOURNAL-CSP-01: check the built public/_headers against the phase this revision declares.
// Usage: node tools/csp-headers-check.mjs <phase> <path to built _headers> [policy file]
// Exits non-zero, with one line per problem, if the file breaks the phase's rule.
//
// Phases this revision knows:
//   none            the file exists and sets no Content-Security-Policy or
//                   Content-Security-Policy-Report-Only header on any path.
//   2a-report-only  exactly one Content-Security-Policy-Report-Only line, for /*, whose
//                   value equals the policy file (csp/phase2.policy) exactly; no
//                   enforcing Content-Security-Policy line anywhere; the policy file
//                   itself is one well-formed line.
// Later phases add their own rule here in the same commit that declares them.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENFORCE = 'content-security-policy';
const REPORT_ONLY = 'content-security-policy-report-only';
const CSP_NAMES = new Set([ENFORCE, REPORT_ONLY]);

// Cloudflare Pages _headers format: '#' comments, an unindented URL pattern line,
// then indented 'Name: value' lines. '! Name' detaches a header and sets nothing.
export function cspLines(text) {
  const found = [];
  let path = null;
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    if (!/^\s/.test(raw)) { path = line; return; }
    if (line.startsWith('!')) return;
    const colon = line.indexOf(':');
    if (colon < 1) return;
    const name = line.slice(0, colon).trim().toLowerCase();
    if (CSP_NAMES.has(name)) found.push({ line: index + 1, path, name, value: line.slice(colon + 1).trim() });
  });
  return found;
}

// The policy file: exactly one non-empty line (a trailing newline is allowed), directives
// separated by '; ', each directive named once.
export function policyProblems(policyText) {
  if (policyText === null) return ['policy file is missing'];
  const body = policyText.endsWith('\n') ? policyText.slice(0, -1) : policyText;
  if (body.trim() === '') return ['policy file is empty'];
  if (/[\r\n]/.test(body)) return ['policy file must be a single line'];
  if (body !== body.trim()) return ['policy file has leading or trailing spaces'];
  const problems = [];
  const seen = new Set();
  // Split on the semicolon itself (CSP allows optional whitespace around it), so a duplicate
  // can't hide behind a missing space; then require the canonical '; ' separator as well.
  const parts = body.split(';').map((part) => part.trim());
  for (const directive of parts) {
    if (directive === '') {
      problems.push('policy has an empty directive');
      continue;
    }
    const name = directive.split(/\s+/)[0].toLowerCase();
    if (!/^[a-z-]+$/.test(name)) problems.push(`policy has a malformed directive: "${directive}"`);
    else if (seen.has(name)) problems.push(`policy names ${name} twice`);
    seen.add(name);
  }
  if (body !== parts.join('; ')) problems.push("policy must separate directives with exactly '; '");
  return problems;
}

export function policyValue(policyText) {
  return policyText.endsWith('\n') ? policyText.slice(0, -1) : policyText;
}

export function checkHeaders(text, phase, policyText = null) {
  if (text === null) return ['public/_headers is missing'];
  const csp = cspLines(text);
  if (phase === 'none') {
    return csp.map((c) => `CSP_PHASE=none but line ${c.line} sets ${c.name} for ${c.path}`);
  }
  if (phase === '2a-report-only') {
    const problems = policyProblems(policyText);
    if (problems.length) return problems;
    const expected = policyValue(policyText);
    for (const c of csp.filter((c) => c.name === ENFORCE)) {
      problems.push(`CSP_PHASE=2a-report-only but line ${c.line} sets an enforcing ${c.name} for ${c.path}`);
    }
    const reportOnly = csp.filter((c) => c.name === REPORT_ONLY);
    if (reportOnly.length !== 1) {
      problems.push(`CSP_PHASE=2a-report-only needs exactly one ${REPORT_ONLY} line, found ${reportOnly.length}`);
    }
    for (const c of reportOnly) {
      if (c.path !== '/*') problems.push(`line ${c.line} sets ${c.name} for ${c.path}, not /*`);
      if (c.value !== expected) problems.push(`line ${c.line} ${c.name} differs from the policy file`);
    }
    return problems;
  }
  return [`unknown CSP_PHASE "${phase}"`];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const [phase, file, policyFile] = process.argv.slice(2);
  if (!phase || !file) {
    console.error('usage: node tools/csp-headers-check.mjs <phase> <_headers path> [policy file]');
    process.exit(2);
  }
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const policyText = policyFile && fs.existsSync(policyFile) ? fs.readFileSync(policyFile, 'utf8') : null;
  const problems = checkHeaders(text, phase, policyText);
  if (problems.length) {
    for (const p of problems) console.error(`csp-headers-check: ${p}`);
    process.exit(1);
  }
  console.log(`csp-headers-check: ${file} OK for CSP_PHASE=${phase}${policyFile ? ` (${policyFile})` : ''}`);
}

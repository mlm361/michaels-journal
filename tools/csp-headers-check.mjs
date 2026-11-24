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
//   2b-enforce      for /*: exactly one enforcing Content-Security-Policy equal to
//                   csp/phase2.policy, exactly one Content-Security-Policy-Report-Only equal
//                   to csp/phase3-report-only.policy, exactly one Reporting-Endpoints
//                   csp="/api/csp-report"; no other path may set or detach them, except in a
//                   preview build (CF_PAGES_BRANCH not master) the two wire-format fixture
//                   paths, which must come after /*, detach all three, and set exactly their
//                   csp/fixture-*.policy (modern also sets Reporting-Endpoints).
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

export function checkHeaders(text, phase, policyText = null, options = {}) {
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
  if (phase === '2b-enforce') return check2b(text, policyText, options);
  return [`unknown CSP_PHASE "${phase}"`];
}

// Phase 2b (plan v2 D7, v3 D3, Sally v4 amendment 2). Every header line, detaches included.
export function headerLines(text) {
  const found = [];
  let path = null;
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    if (!/^\s/.test(raw)) { path = line; return; }
    if (line.startsWith('!')) {
      found.push({ line: index + 1, path, name: line.slice(1).trim().toLowerCase(), detach: true });
      return;
    }
    const colon = line.indexOf(':');
    if (colon < 1) return;
    found.push({ line: index + 1, path, name: line.slice(0, colon).trim().toLowerCase(), value: line.slice(colon + 1).trim(), detach: false });
  });
  return found;
}

export const REPORTING = 'reporting-endpoints';
export const REPORTING_VALUE = 'csp="/api/csp-report"';
export const FIXTURE_PATHS = { '/__csp-fixture/legacy/*': 'legacy', '/__csp-fixture/modern/*': 'modern' };
const WATCHED = new Set([ENFORCE, REPORT_ONLY, REPORTING]);

// options: { reportOnlyPolicyText, preview, fixturePolicies: { legacy, modern } }
function check2b(text, policyText, options) {
  const problems = [...policyProblems(policyText)];
  const roText = options.reportOnlyPolicyText ?? null;
  problems.push(...policyProblems(roText).map((p) => `report-only ${p}`));
  if (problems.length) return problems;
  const enforce = policyValue(policyText);
  const reportOnly = policyValue(roText);
  if (enforce === reportOnly) return ['the report-only policy must differ from the enforced policy'];
  const lines = headerLines(text).filter((h) => WATCHED.has(h.name));
  const byPath = new Map();
  for (const h of lines) {
    if (!byPath.has(h.path)) byPath.set(h.path, []);
    byPath.get(h.path).push(h);
  }
  const exactlyOne = (list, name, expected, where) => {
    const set = list.filter((h) => h.name === name && !h.detach);
    if (set.length !== 1) problems.push(`${where} needs exactly one ${name} line, found ${set.length}`);
    for (const h of set) if (h.value !== expected) problems.push(`line ${h.line} ${name} for ${where} differs from its policy file`);
  };
  const catchAll = byPath.get('/*') ?? [];
  if (catchAll.some((h) => h.detach)) problems.push('/* must not detach CSP or reporting headers');
  exactlyOne(catchAll, ENFORCE, enforce, '/*');
  exactlyOne(catchAll, REPORT_ONLY, reportOnly, '/*');
  exactlyOne(catchAll, REPORTING, REPORTING_VALUE, '/*');
  for (const [path, list] of byPath) {
    if (path === '/*') continue;
    const fixture = FIXTURE_PATHS[path];
    if (!fixture || !options.preview) {
      problems.push(`${path} sets or detaches CSP/reporting headers${fixture ? ' (fixtures are preview-only)' : ''}`);
      continue;
    }
    for (const name of WATCHED) {
      if (list.filter((h) => h.detach && h.name === name).length !== 1) problems.push(`${path} must detach ${name} exactly once`);
    }
    const policy = options.fixturePolicies?.[fixture];
    if (policy == null) { problems.push(`no fixture policy file for ${fixture}`); continue; }
    exactlyOne(list, ENFORCE, policyValue(policy), path);
    if (list.some((h) => h.name === REPORT_ONLY && !h.detach)) problems.push(`${path} must not set ${REPORT_ONLY}`);
    const wantsEndpoints = fixture === 'modern';
    const endpoints = list.filter((h) => h.name === REPORTING && !h.detach);
    if (wantsEndpoints) exactlyOne(list, REPORTING, REPORTING_VALUE, path);
    else if (endpoints.length) problems.push(`${path} must not set ${REPORTING}`);
    // Pages applies rules in order; a fixture rule above the catch-all would be overridden.
    const catchAllLast = Math.max(...catchAll.map((h) => h.line));
    if (Math.min(...list.map((h) => h.line)) < catchAllLast) problems.push(`${path} must come after the /* rule`);
  }
  if (options.preview) {
    for (const path of Object.keys(FIXTURE_PATHS)) if (!byPath.has(path)) problems.push(`preview build is missing ${path}`);
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const [phase, file, policyFile, reportOnlyFile] = process.argv.slice(2);
  if (!phase || !file) {
    console.error('usage: node tools/csp-headers-check.mjs <phase> <_headers path> [policy file] [report-only policy file]');
    process.exit(2);
  }
  const readIf = (f) => (f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
  const text = readIf(file);
  const policyText = readIf(policyFile);
  const { isPreview, FIXTURES } = await import('./csp-preview.mjs');
  const options = {
    reportOnlyPolicyText: readIf(reportOnlyFile),
    preview: isPreview(),
    fixturePolicies: Object.fromEntries(Object.entries(FIXTURES).map(([name, f]) => [name, readIf(f.policyFile)])),
  };
  const problems = checkHeaders(text, phase, policyText, options);
  if (problems.length) {
    for (const p of problems) console.error(`csp-headers-check: ${p}`);
    process.exit(1);
  }
  console.log(`csp-headers-check: ${file} OK for CSP_PHASE=${phase}${policyFile ? ` (${policyFile})` : ''}`);
}

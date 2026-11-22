// JOURNAL-CSP-01: check the built public/_headers against the phase this revision declares.
// Usage: node tools/csp-headers-check.mjs <phase> <path to built _headers>
// Exits non-zero, with one line per problem, if the file breaks the phase's rule.
//
// Phase 0 knows one phase:
//   none  the file exists and sets no Content-Security-Policy or
//         Content-Security-Policy-Report-Only header on any path.
// Later phases add their own rule here in the same commit that declares them.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const CSP_NAMES = new Set(['content-security-policy', 'content-security-policy-report-only']);

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

export function checkHeaders(text, phase) {
  if (text === null) return ['public/_headers is missing'];
  if (phase === 'none') {
    return cspLines(text).map((c) => `CSP_PHASE=none but line ${c.line} sets ${c.name} for ${c.path}`);
  }
  return [`unknown CSP_PHASE "${phase}"`];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const [phase, file] = process.argv.slice(2);
  if (!phase || !file) {
    console.error('usage: node tools/csp-headers-check.mjs <phase> <_headers path>');
    process.exit(2);
  }
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const problems = checkHeaders(text, phase);
  if (problems.length) {
    for (const p of problems) console.error(`csp-headers-check: ${p}`);
    process.exit(1);
  }
  console.log(`csp-headers-check: ${file} OK for CSP_PHASE=${phase}`);
}

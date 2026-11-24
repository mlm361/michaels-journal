// JOURNAL-CSP-01 Phase 2b, plan D1 + D3 fixtures: preview-only build steps.
// Usage (always run by tools/pages-build.sh, after the baseline build):
//   node tools/csp-preview.mjs <path to zola>
//
// Production (CF_PAGES_BRANCH unset or "master"): changes nothing. It only refuses a build
// whose output already contains the preview fixtures, so production output stays the
// baseline build byte for byte.
//
// Preview (any other branch):
//   1. CF_PAGES_URL must be https://<deployment>.michaels-journal.pages.dev, otherwise the
//      build fails (fail closed; a preview must never build with the production base URL).
//   2. Rebuild with --base-url "$CF_PAGES_URL", so links, feeds and the search index point
//      at the preview itself.
//   3. Add the two wire-format fixtures (plan v3 D3; Sally v4 amendment 2): pages under
//      /__csp-fixture/legacy/ and /__csp-fixture/modern/, each with one blocked inline
//      script, and _headers rules placed AFTER the catch-all that detach the inherited
//      enforced, Report-Only and Reporting-Endpoints values before setting the fixture's
//      exact policy (Pages joins duplicate header values otherwise).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_BRANCH = 'master';
export const PREVIEW_URL = /^https:\/\/[a-z0-9-]{1,63}\.michaels-journal\.pages\.dev\/?$/;
export const FIXTURE_ROOT = '__csp-fixture';
export const FIXTURES = {
  legacy: { policyFile: 'csp/fixture-legacy.policy', reportingEndpoints: false },
  modern: { policyFile: 'csp/fixture-modern.policy', reportingEndpoints: true },
};
export const REPORTING_ENDPOINTS = 'csp="/api/csp-report"';

export function isPreview(env = process.env) {
  const branch = env.CF_PAGES_BRANCH;
  return Boolean(branch) && branch !== PRODUCTION_BRANCH;
}

export function previewBaseUrl(env = process.env) {
  const url = env.CF_PAGES_URL || '';
  if (!PREVIEW_URL.test(url)) {
    throw new Error(`preview build needs CF_PAGES_URL like https://<id>.michaels-journal.pages.dev, got "${url}"`);
  }
  return url.replace(/\/$/, '');
}

export function readPolicy(root, file) {
  return fs.readFileSync(path.join(root, file), 'utf8').replace(/\n$/, '');
}

// The _headers block appended in preview builds only.
export function fixtureHeaders(root) {
  const out = ['', '# Preview-only CSP wire-format fixtures (tools/csp-preview.mjs). Never in production.'];
  for (const [name, f] of Object.entries(FIXTURES)) {
    out.push(`/${FIXTURE_ROOT}/${name}/*`);
    out.push('  ! Content-Security-Policy');
    out.push('  ! Content-Security-Policy-Report-Only');
    out.push('  ! Reporting-Endpoints');
    out.push(`  Content-Security-Policy: ${readPolicy(root, f.policyFile)}`);
    if (f.reportingEndpoints) out.push(`  Reporting-Endpoints: ${REPORTING_ENDPOINTS}`);
  }
  return out.join('\n') + '\n';
}

export function fixturePage(name) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>CSP fixture: ${name}</title></head>
<body>
<p>CSP wire-format fixture (${name}). The inline script below is blocked on purpose.</p>
<script>document.body.dataset.fixtureRan = '${name}';</script>
</body>
</html>
`;
}

export function run(zola, { root = process.cwd(), env = process.env, out = 'public' } = {}) {
  const publicDir = path.join(root, out);
  const fixtureDir = path.join(publicDir, FIXTURE_ROOT);
  if (!isPreview(env)) {
    if (fs.existsSync(fixtureDir)) throw new Error(`production build must not contain ${out}/${FIXTURE_ROOT}`);
    return { mode: 'production' };
  }
  const baseUrl = previewBaseUrl(env);
  const built = spawnSync(zola, ['build', '--base-url', baseUrl, '--force'], { cwd: root, stdio: 'inherit' });
  if (built.status !== 0) throw new Error(`preview rebuild failed (exit ${built.status})`);
  for (const name of Object.keys(FIXTURES)) {
    fs.mkdirSync(path.join(fixtureDir, name), { recursive: true });
    fs.writeFileSync(path.join(fixtureDir, name, 'index.html'), fixturePage(name));
  }
  fs.appendFileSync(path.join(publicDir, '_headers'), fixtureHeaders(root));
  return { mode: 'preview', baseUrl };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const zola = process.argv[2];
  if (!zola) {
    console.error('usage: node tools/csp-preview.mjs <path to zola>');
    process.exit(2);
  }
  try {
    const result = run(zola);
    console.log(`csp-preview: ${result.mode}${result.baseUrl ? ` build for ${result.baseUrl}` : ', nothing changed'}`);
  } catch (error) {
    console.error(`csp-preview: ${error.message}`);
    process.exit(1);
  }
}

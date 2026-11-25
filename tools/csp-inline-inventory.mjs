// JOURNAL-CSP-01 Phase 2b (plan v2 D3, v3 D5b): the build-time inventory of inline code.
//
//   node tools/csp-inline-inventory.mjs emit <public dir>
//       Pages build step. Writes the collector's data under <public>/__csp/:
//         routes.json  every canonical page path (the only values page_id may take);
//         pos/<key>.json  per page, where each inline script and handler sits (attribution);
//         meta.json    the shipped policies (and, in preview, the fixture policies) and the
//                      fixed host list for the "blocked" bucket.
//       Never fails the build because of new inline code (Blog Poster pushes posts).
//   node tools/csp-inline-inventory.mjs check <public dir> [inventory file]
//       npm test. Fails if any inline script or handler in the build is not listed in
//       csp/phase3-inline-inventory.json (the Phase 3 migration source).
//   node tools/csp-inline-inventory.mjs write <public dir> [inventory file]
//       Regenerates the committed inventory (review the diff).
//
// Identity (stable across posts):
//   template scripts   their data-csp-id attribute (templates tag every inline <script>);
//   content scripts    "content:" + the first 16 hex of the SHA-256 of the script text with LF line endings;
//   inline handlers    "handler:<element>.<attribute>:" + 12 hex of the value's SHA-256.
// JSON data blocks (application/json, application/ld+json, importmap) are not code.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const HANDLER = /<([a-z][a-z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*?\s(on[a-z]+)\s*=\s*("([^"]*)"|'([^']*)')/gi;
const DATA_TYPE = /\btype\s*=\s*["']?(application\/(ld\+)?json|importmap)\b/i;

export const routeKey = (route) => sha(route).slice(0, 16);

export function pagePath(publicDir, file) {
  const rel = path.relative(publicDir, file).split(path.sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length);
  return '/' + rel;
}

function lineCol(text, offset) {
  let line = 1;
  let last = -1;
  for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) {
    line++;
    last = i;
  }
  return { line, col: offset - last };
}

// Inline code on one page, in document order.
export function scanPage(html) {
  const items = [];
  for (const m of html.matchAll(SCRIPT)) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs) || DATA_TYPE.test(attrs)) continue;
    const tagged = attrs.match(/\bdata-csp-id\s*=\s*"([a-z0-9.-]+)"/i);
    // Zola's built-in redirect scripts use the platform's line endings.
    const id = tagged ? tagged[1] : `content:${sha(m[2].replace(/\r\n/g, '\n')).slice(0, 16)}`;
    const start = lineCol(html, m.index);
    const body = lineCol(html, m.index + m[0].indexOf('>') + 1);
    items.push({ id, kind: 'script', line: start.line, col: start.col, endLine: body.line });
  }
  for (const m of html.matchAll(HANDLER)) {
    const value = m[4] ?? m[5] ?? '';
    const at = lineCol(html, m.index);
    items.push({ id: `handler:${m[1].toLowerCase()}.${m[2].toLowerCase()}:${sha(value).slice(0, 12)}`, kind: 'handler', line: at.line, col: at.col, endLine: lineCol(html, m.index + m[0].length).line });
  }
  return items.sort((a, b) => a.line - b.line || a.col - b.col);
}

export function htmlFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) out.push(p);
    }
  })(dir);
  return out.sort();
}

export function inventoryOf(publicDir) {
  const items = {};
  const pages = [];
  for (const file of htmlFiles(publicDir)) {
    const route = pagePath(publicDir, file);
    if (route.startsWith('/__csp-fixture/')) continue;
    const found = scanPage(fs.readFileSync(file, 'utf8'));
    pages.push({ route, found });
    for (const it of found) {
      if (!items[it.id] || route < items[it.id].example) items[it.id] = { kind: it.kind, example: route };
    }
  }
  return { items, pages };
}

// Hosts named in the shipped policies: the only external values the "blocked" bucket keeps.
export function policyHosts(...policies) {
  const hosts = new Set();
  for (const p of policies) {
    for (const token of p.split(/[\s;]+/)) {
      const m = token.match(/^(https|wss):\/\/([^/]+)$/);
      if (m) hosts.add(m[2].toLowerCase());
    }
  }
  return [...hosts].sort();
}

export function emit(publicDir, { root = process.cwd(), env = process.env } = {}) {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\n$/, '');
  const policies = { 'enforce-2b': read('csp/phase2.policy'), 'ro-phase3': read('csp/phase3-report-only.policy') };
  const preview = Boolean(env.CF_PAGES_BRANCH) && env.CF_PAGES_BRANCH !== 'master';
  if (preview) {
    policies['fixture-legacy'] = read('csp/fixture-legacy.policy');
    policies['fixture-modern'] = read('csp/fixture-modern.policy');
  }
  const out = path.join(publicDir, '__csp');
  fs.mkdirSync(path.join(out, 'pos'), { recursive: true });
  const routes = [];
  for (const file of htmlFiles(publicDir)) {
    const route = pagePath(publicDir, file);
    routes.push(route);
    const found = scanPage(fs.readFileSync(file, 'utf8')).map(({ id, line, col, endLine }) => [id, line, col, endLine]);
    fs.writeFileSync(path.join(out, 'pos', `${routeKey(route)}.json`), JSON.stringify(found));
  }
  fs.writeFileSync(path.join(out, 'routes.json'), JSON.stringify(routes.sort()));
  const meta = {
    version: 1,
    mode: preview ? 'preview' : 'production',
    canonical_host: 'michaelreflects.com',
    preview_host: preview ? new URL(env.CF_PAGES_URL).host : null,
    policies,
    hosts: policyHosts(...Object.values(policies)),
  };
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta));
  return { routes: routes.length, mode: meta.mode };
}

export function readInventory(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function unlisted(publicDir, inventory) {
  const { items } = inventoryOf(publicDir);
  return Object.entries(items).filter(([id]) => !(id in inventory.items)).map(([id, it]) => ({ id, ...it }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const [mode, publicDir, inventoryFile = 'csp/phase3-inline-inventory.json'] = process.argv.slice(2);
  if (!['emit', 'check', 'write'].includes(mode) || !publicDir) {
    console.error('usage: node tools/csp-inline-inventory.mjs emit|check|write <public dir> [inventory file]');
    process.exit(2);
  }
  if (mode === 'emit') {
    const r = emit(publicDir);
    console.log(`csp-inline-inventory: ${r.mode} data for ${r.routes} pages in ${publicDir}/__csp`);
  } else if (mode === 'write') {
    const { items } = inventoryOf(publicDir);
    const sorted = Object.fromEntries(Object.entries(items).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(inventoryFile, JSON.stringify({ version: 1, items: sorted }, null, 2) + '\n');
    console.log(`csp-inline-inventory: wrote ${Object.keys(sorted).length} items to ${inventoryFile}`);
  } else {
    const missing = unlisted(publicDir, readInventory(inventoryFile));
    for (const m of missing) console.error(`csp-inline-inventory: unlisted ${m.kind} ${m.id} (first seen on ${m.example})`);
    if (missing.length) process.exit(1);
    console.log('csp-inline-inventory: every inline script and handler is listed');
  }
}

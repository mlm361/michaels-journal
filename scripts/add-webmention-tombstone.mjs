import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_ROUTE_RULES = 100;

export function normalizeTombstonePath(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith('/') || raw.includes('?') || raw.includes('#')) {
    throw new Error('path must be an absolute URL path without query or fragment');
  }
  const normalized = raw.replace(/\/+$/, '');
  if (!normalized || normalized === '/') {
    throw new Error('the site root cannot become a Webmention tombstone');
  }
  const segments = normalized.slice(1).split('/');
  for (const segment of segments) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(segment) || segment === '.' || segment === '..') {
      throw new Error(`unsafe or unsupported path segment: ${segment}`);
    }
  }
  return '/' + segments.join('/');
}

export function tombstoneRouteRules(value) {
  const canonical = normalizeTombstonePath(value);
  return [canonical, canonical + '/'];
}

export function functionFileForPath(repoRoot, value) {
  const segments = normalizeTombstonePath(value).slice(1).split('/');
  return path.join(repoRoot, 'functions', ...segments, 'index.js');
}

function functionSource(repoRoot, destination) {
  const shared = path.join(repoRoot, 'functions', '_shared', 'deleted-post.js');
  let relative = path.relative(path.dirname(destination), shared).replaceAll('\\', '/');
  if (!relative.startsWith('.')) relative = './' + relative;
  return `import { deletedPostResponse } from '${relative}';\n\n` +
    'export function onRequest() {\n  return deletedPostResponse();\n}\n';
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function functionRoute(relative) {
  const segments = relative.replace(/\.(?:js|ts)$/, '').split('/');
  if (segments.at(-1) === 'index') segments.pop();
  if (segments.at(-1) === '_middleware') segments.splice(-1, 1, '[[path]]');
  let pattern = '^';
  for (const segment of segments) {
    if (/^\[\[.+\]\]$/.test(segment)) pattern += '(?:/.*)?';
    else if (/^\[.+\]$/.test(segment)) pattern += '/[^/]+';
    else pattern += '/' + escaped(segment);
  }
  return new RegExp(pattern + '/?$', 'i');
}

async function functionFiles(directory, prefix = '') {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('_') && !/^_middleware\.(js|ts)$/.test(entry.name)) continue;
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await functionFiles(path.join(directory, entry.name), relative + '/'));
    else if (entry.isFile() && /\.(js|ts)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

async function assertRouteAvailable(repoRoot, canonical, routes, destination, desiredSource) {
  // This separately routed receiver intercepted /webmention-* before Pages.
  if (canonical.toLowerCase().startsWith('/webmention')) {
    throw new Error('path overlaps the external Webmention receiver route');
  }
  for (const rule of routes.exclude || []) {
    const matches = new RegExp('^' + rule.split('*').map(escaped).join('.*') + '$');
    if (tombstoneRouteRules(canonical).some(route => matches.test(route))) {
      throw new Error(`path is excluded from Pages Functions: ${rule}`);
    }
  }
  const functions = path.join(repoRoot, 'functions');
  for (const relative of await functionFiles(functions)) {
    const filename = path.join(functions, ...relative.split('/'));
    if (filename === destination && await readFile(filename, 'utf8') === desiredSource) continue;
    if (functionRoute(relative).test(canonical)) {
      throw new Error(`refusing to replace existing Function route: ${relative}`);
    }
  }
}

export async function installTombstone(repoRoot, value) {
  const canonical = normalizeTombstonePath(value);
  const routesPath = path.join(repoRoot, 'static', '_routes.json');
  const routes = JSON.parse(await readFile(routesPath, 'utf8'));
  const additions = tombstoneRouteRules(canonical);
  routes.include = [...new Set([...(routes.include || []), ...additions])];
  const ruleCount = routes.include.length + (routes.exclude || []).length;
  if (ruleCount > MAX_ROUTE_RULES) {
    throw new Error(`Cloudflare Pages route limit exceeded: ${ruleCount}/${MAX_ROUTE_RULES}`);
  }
  for (const rule of [...routes.include, ...(routes.exclude || [])]) {
    if (rule.length > 100) throw new Error(`Cloudflare route exceeds 100 characters: ${rule}`);
  }

  const destination = functionFileForPath(repoRoot, canonical);
  const desiredSource = functionSource(repoRoot, destination);
  await assertRouteAvailable(repoRoot, canonical, routes, destination, desiredSource);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, desiredSource, { encoding: 'utf8', flag: 'wx' })
    .catch(async (error) => {
      if (error.code !== 'EEXIST') throw error;
      const existing = await readFile(destination, 'utf8');
      if (existing !== desiredSource) {
        throw new Error(`refusing to replace existing Function: ${destination}`);
      }
    });
  await writeFile(routesPath, JSON.stringify(routes, null, 2) + '\n', 'utf8');
  return { canonical, destination, routeRules: additions };
}

async function main() {
  const index = process.argv.indexOf('--path');
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error('usage: npm run tombstone:add -- --path /canonical/post/path/');
  }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await installTombstone(repoRoot, process.argv[index + 1]);
  console.log(`Installed HTTP 410 tombstone for ${result.canonical}`);
  console.log(`Function: ${path.relative(repoRoot, result.destination)}`);
  console.log(`Routes: ${result.routeRules.join(', ')}`);
  console.log('Deploy this commit before sending deletion Webmentions.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

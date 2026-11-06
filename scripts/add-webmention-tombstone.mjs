import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

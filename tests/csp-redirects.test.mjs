// JOURNAL-CSP-01 Phase 3 step 1: Zola's generated redirect pages (front-matter aliases and the
// paginator's /page/1/) carry no inline code, and each one is also an HTTP 301 in static/_redirects,
// so Cloudflare redirects before the page is served and the browser keeps the #fragment.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { scanPage } from '../tools/csp-inline-inventory.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const ORIGIN = 'https://michaelreflects.com';

function redirectRules() {
  const rules = new Map();
  for (const line of read('static/_redirects').split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (!parts[0] || parts[0].startsWith('#')) continue;
    rules.set(parts[0], { to: parts[1], status: parts[2] });
  }
  return rules;
}

function redirectPages(dir, publicDir = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) redirectPages(full, publicDir, out);
    else if (entry.name === 'index.html') {
      const html = fs.readFileSync(full, 'utf8');
      if (html.includes('<title>Redirect</title>')) {
        const rel = path.relative(publicDir, path.dirname(full)).split(path.sep).join('/');
        out.push({ route: `/${rel}/`, html });
      }
    }
  }
  return out;
}

test('step 1: the alias template has no inline code and runs the helper before the meta refresh', () => {
  const template = read('templates/internal/alias.html');
  assert.deepEqual(scanPage(template), [], 'no inline script or handler');
  const helper = template.indexOf('<script src="/js/alias-redirect.js" data-target="{{ url }}"></script>');
  const refresh = template.indexOf('<meta http-equiv="refresh" content="0; url={{ url }}">');
  assert.ok(helper !== -1 && refresh !== -1 && helper < refresh);
  assert.match(template, /<link rel="canonical" href="\{\{ url \}\}">/);
  assert.match(template, /<a href="\{\{ url \}\}">Click here<\/a>/);
});

test('step 1: every generated redirect page is script-free inline and has its 301 in _redirects', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-redirects-'));
  try {
    const built = spawnSync('zola', ['build', '-o', out, '--force'], { cwd: root, encoding: 'utf8' });
    if (built.error) throw built.error;
    assert.equal(built.status, 0, built.stderr || 'Zola build failed');
    const pages = redirectPages(out);
    // Today: the paginator's first page and the one front-matter alias. More may come; each needs rules.
    assert.ok(pages.some((p) => p.route === '/page/1/'), 'paginator redirect page');
    assert.ok(pages.some((p) => p.route === '/blog/watched-project-hail-mary-2026-on-prime-video/'), 'alias page');
    const rules = redirectRules();
    for (const { route, html } of pages) {
      assert.deepEqual(scanPage(html), [], `${route} has inline code`);
      const target = html.match(/data-target="([^"]+)"/)?.[1];
      assert.ok(target && target.startsWith(ORIGIN + '/'), `${route} target`);
      const want = target.slice(ORIGIN.length);
      for (const from of [route, route.replace(/\/$/, '')]) {
        assert.deepEqual(rules.get(from), { to: want, status: '301' }, `_redirects needs "${from} ${want} 301"`);
      }
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

function runHelper(target, href) {
  const replaced = [];
  const url = new URL(href);
  const window = { location: { href, hash: url.hash, origin: url.origin, replace: (to) => replaced.push(to) } };
  const document = { currentScript: target === null ? null : { getAttribute: (name) => (name === 'data-target' ? target : null) } };
  vm.runInNewContext(read('static/js/alias-redirect.js'), { window, document, URL });
  return replaced;
}

test('step 1: the helper keeps the fragment and only follows a same-origin target', () => {
  assert.deepEqual(runHelper(`${ORIGIN}/`, `${ORIGIN}/page/1/#x`), [`${ORIGIN}/#x`]);
  assert.deepEqual(runHelper(`${ORIGIN}/blog/a/`, `${ORIGIN}/blog/old/#comments`), [`${ORIGIN}/blog/a/#comments`]);
  assert.deepEqual(runHelper(`${ORIGIN}/blog/a/`, `${ORIGIN}/blog/old/`), [`${ORIGIN}/blog/a/`]);
  assert.deepEqual(runHelper('https://evil.example/', `${ORIGIN}/page/1/#x`), []);
  assert.deepEqual(runHelper(null, `${ORIGIN}/page/1/`), []);
  assert.deepEqual(runHelper('', `${ORIGIN}/page/1/`), []);
});

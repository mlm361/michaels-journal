// JOURNAL-CSP-01 Phase 3 step 1: Zola's generated redirect pages (front-matter aliases and the
// paginator's /page/1/) carry no inline code and still redirect: an external helper keeps the #fragment,
// and a plain meta refresh works without JavaScript. (Pages serves these files even if _redirects names them.)
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

// The source of truth: every front-matter alias (redirecting to the page that declares it) and the
// paginator's first page of each paginated section (redirecting to the section).
function expectedRedirects() {
  const expected = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.md')) continue;
      const front = fs.readFileSync(full, 'utf8').match(/^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+/)?.[1] ?? '';
      const rel = path.relative(path.join(root, 'content'), dir).split(path.sep).join('/');
      if (entry.name === '_index.md' && /^paginate_by\s*=/m.test(front)) {
        const section = rel ? `/${rel}/` : '/';
        expected.set(`${section}page/1/`, { section });
      }
      const aliases = front.match(/^aliases\s*=\s*\[([^\]]*)\]/m)?.[1];
      for (const alias of aliases ? [...aliases.matchAll(/"([^"]+)"/g)].map((m) => m[1]) : []) {
        expected.set(alias, { title: JSON.parse(front.match(/^title\s*=\s*("(?:[^"\\]|\\.)*")/m)[1]) });
      }
    }
  };
  walk(path.join(root, 'content'));
  return expected;
}

test('step 1: every generated redirect page is script-free inline and targets its source of truth', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-redirects-'));
  try {
    const built = spawnSync('zola', ['build', '-o', out, '--force'], { cwd: root, encoding: 'utf8' });
    if (built.error) throw built.error;
    assert.equal(built.status, 0, built.stderr || 'Zola build failed');
    const pages = redirectPages(out);
    const expected = expectedRedirects();
    assert.deepEqual(pages.map((p) => p.route).sort(), [...expected.keys()].sort(), 'redirect pages == aliases + /page/1/');
    assert.ok(expected.has('/page/1/') && expected.has('/blog/watched-project-hail-mary-2026-on-prime-video/'));
    for (const { route, html } of pages) {
      assert.deepEqual(scanPage(html), [], `${route} has inline code`);
      const target = html.match(/data-target="([^"]+)"/)?.[1];
      assert.ok(target && target.startsWith(ORIGIN + '/'), `${route} target`);
      for (const attr of [`href="${target}"`, `content="0; url=${target}"`]) assert.ok(html.includes(attr), `${route}: ${attr}`);
      const want = expected.get(route);
      const targetPath = target.slice(ORIGIN.length);
      if (want.section) assert.equal(targetPath, want.section, `${route} -> its section`);
      else {
        const page = fs.readFileSync(path.join(out, targetPath, 'index.html'), 'utf8');
        assert.ok(!page.includes('<title>Redirect</title>'), `${route} target is a real page`);
        const escaped = want.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        assert.ok(page.includes(want.title) || page.includes(escaped), `${route} -> the page that declares the alias`);
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

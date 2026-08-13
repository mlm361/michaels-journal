import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { onRequestGet as twitterMedia } from '../functions/tweets/media/[[path]].js';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function filesUnder(relative, extension) {
  const found = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name.endsWith(extension)) found.push(absolute);
    }
  };
  visit(path.join(root, relative));
  return found;
}

test('shared URL validator accepts only credential-free HTTP URLs', () => {
  const source = read('static/js/url-safety.js');
  const window = {};
  vm.runInNewContext(source, { window, globalThis: window, URL, Object });
  const safe = window.MichaelUrlSafety.publicHttpUrl;

  assert.equal(safe('https://example.com/path'), 'https://example.com/path');
  assert.equal(safe('http://example.com/path'), 'http://example.com/path');
  assert.equal(safe('javascript:alert(1)'), '');
  assert.equal(safe('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(safe('https://user:password@example.com/private'), '');
  assert.equal(safe('/relative/path'), '');
  assert.equal(Object.isFrozen(window.MichaelUrlSafety), true);
});

test('R2 media proxy cannot serve same-origin HTML from object metadata', async () => {
  const object = {
    body: '<script>alert(1)</script>',
    etag: 'fixture',
    httpMetadata: { contentType: 'text/html' },
  };
  const bucket = { get: async () => object };

  const image = await twitterMedia({ params: { path: ['archive', 'photo.jpg'] }, env: { TWITTER_MEDIA: bucket } });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(image.headers.get('cross-origin-resource-policy'), 'same-origin');

  const html = await twitterMedia({ params: { path: ['archive', 'payload.html'] }, env: { TWITTER_MEDIA: bucket } });
  assert.equal(html.status, 404);
  const extensionless = await twitterMedia({ params: { path: ['archive', 'payload'] }, env: { TWITTER_MEDIA: bucket } });
  assert.equal(extensionless.status, 404);
});

test('DOM rendering and third-party gallery assets stay hardened', () => {
  const base = read('themes/ergo/templates/base.html');
  const themeSelector = read('themes/ergo/static/theme_selector.js');
  const search = read('templates/search.html');
  const tweets = read('static/js/tweets.js');
  const tweetsOnThisDay = read('static/js/tweets-on-this-day.js');
  const webmentions = read('themes/ergo/templates/partials/webmentions.html');
  const gallery = read('templates/gallery/single.html');
  const postShare = read('themes/ergo/templates/partials/post-share.html');

  assert.doesNotMatch(base, /document\.write/);
  assert.match(base, /storedTheme === 'dark' \? 'dark' : 'default'/);
  assert.match(themeSelector, /function normalizeTheme/);
  assert.doesNotMatch(search, /li\.innerHTML/);
  assert.match(search, /anchor\.textContent = label/);
  assert.match(search, /safeSearchHref/);
  assert.match(tweets, /MichaelUrlSafety\.publicHttpUrl/);
  assert.match(tweetsOnThisDay, /MichaelUrlSafety\.publicHttpUrl/);
  assert.match(webmentions, /MichaelUrlSafety\.publicHttpUrl/);
  assert.match(webmentions, /new DOMParser\(\)\.parseFromString/);
  assert.match(gallery, /glightbox@3\.3\.1/);
  assert.match(gallery, /integrity="sha384-GPAzSuZc0kFvdIev6wm9zg8gnafE8tLso7rsAYQfc9hAdWCpOcpcNI5W9lWkYcsd"/);
  assert.match(gallery, /integrity="sha384-MZZbZ6RXJudK43v1qY1zOWKOU2yfeBPatuFoKyHAaAgHTUZhwblRTc9CphTt4IGQ"/);
  assert.match(postShare, /\^\[0-9a-f-\]\{36\}\$/);
  assert.match(postShare, /\^\\d\+\$/);
});

test('workflows use immutable action SHAs and local secret files are ignored', () => {
  const workflowDir = path.join(root, '.github', 'workflows');
  const workflows = fs.readdirSync(workflowDir)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => read(path.join('.github', 'workflows', name)));

  for (const workflow of workflows) {
    assert.doesNotMatch(workflow, /uses:\s+[^\s]+@v\d+/);
    for (const match of workflow.matchAll(/uses:\s+[^\s]+@([^\s]+)/g)) {
      assert.match(match[1], /^[0-9a-f]{40}$/);
    }
  }

  const ignore = read('.gitignore');
  for (const required of ['.env', '.dev.vars', '*.pem', '*.key', '*.db', 'gcm-diagnose.log', '*.bak']) {
    assert.ok(ignore.split(/\r?\n/).includes(required), `missing ignore rule: ${required}`);
  }

  const headers = read('static/_headers');
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Referrer-Policy: strict-origin-when-cross-origin/);
});

test('committed content has no insecure active HTTP resources', () => {
  for (const contentFile of filesUnder('content', '.md')) {
    const source = fs.readFileSync(contentFile, 'utf8');
    assert.doesNotMatch(
      source,
      /<(?:iframe|script|img|source|video|audio)\b[^>]+(?:src|href)=["']http:\/\//i,
      `insecure active resource in ${path.relative(root, contentFile)}`,
    );
  }
});

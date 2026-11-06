import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  functionFileForPath,
  installTombstone,
  normalizeTombstonePath,
  tombstoneRouteRules,
} from '../scripts/add-webmention-tombstone.mjs';


test('path validation accepts slugs and refuses broad or ambiguous routes', () => {
  assert.equal(normalizeTombstonePath('/blog/a-post/'), '/blog/a-post');
  assert.deepEqual(tombstoneRouteRules('/blog/a-post/'), [
    '/blog/a-post',
    '/blog/a-post/',
  ]);
  for (const value of ['/', 'https://example.com/x', '/a?x=1', '/a#x', '/../x', '/a/*']) {
    assert.throws(() => normalizeTombstonePath(value));
  }
});


test('installer creates one exact-path Function and literal route rules idempotently', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'journal-tombstone-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'static'), { recursive: true });
  await mkdir(path.join(root, 'functions', '_shared'), { recursive: true });
  await writeFile(path.join(root, 'functions', '_shared', 'deleted-post.js'), 'export {}\n');
  await writeFile(path.join(root, 'static', '_routes.json'), JSON.stringify({
    version: 1,
    include: ['/api/webmentions'],
    exclude: [],
  }));

  const first = await installTombstone(root, '/blog/a-post/');
  const second = await installTombstone(root, '/blog/a-post');
  assert.equal(first.destination, functionFileForPath(root, '/blog/a-post'));
  assert.equal(second.destination, first.destination);
  const source = await readFile(first.destination, 'utf8');
  assert.match(source, /deletedPostResponse/);
  assert.match(source, /\.\.\/\.\.\/_shared\/deleted-post\.js/);

  const routes = JSON.parse(await readFile(path.join(root, 'static', '_routes.json'), 'utf8'));
  assert.deepEqual(routes.include, [
    '/api/webmentions',
    '/blog/a-post',
    '/blog/a-post/',
  ]);
  assert.equal(routes.include.some((route) => route.includes('*')), false);

  const collision = functionFileForPath(root, '/blog/collision');
  await mkdir(path.dirname(collision), { recursive: true });
  await writeFile(collision, 'export function onRequest() { return new Response("live"); }\n');
  await assert.rejects(
    installTombstone(root, '/blog/collision/'),
    /refusing to replace existing Function/,
  );
  const afterCollision = JSON.parse(
    await readFile(path.join(root, 'static', '_routes.json'), 'utf8'),
  );
  assert.equal(afterCollision.include.includes('/blog/collision'), false);
});

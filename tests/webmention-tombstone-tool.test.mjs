import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const {
  functionFileForPath,
  installTombstone,
  normalizeTombstonePath,
  tombstoneRouteRules,
} = await import(process.env.TOMBSTONE_MODULE_SOURCE || '../scripts/add-webmention-tombstone.mjs');

async function fixture(t, excludes = []) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'journal-routes-'));
  t.after(() => rm(root, { recursive:true, force:true }));
  await mkdir(path.join(root,'static'), {recursive:true});
  await mkdir(path.join(root,'functions','_shared'), {recursive:true});
  await writeFile(path.join(root,'functions','_shared','deleted-post.js'), 'export {}\n');
  await writeFile(path.join(root,'static','_routes.json'), JSON.stringify({version:1,include:['/api/webmentions'],exclude:excludes}));
  return root;
}

async function snapshot(root) {
  const result = {};
  for (const name of (await readdir(root, {recursive:true})).sort()) {
    try { result[name] = await readFile(path.join(root,name),'utf8'); }
    catch (error) { if(error.code !== 'EISDIR' && error.code !== 'EPERM') throw error; result[name]='<directory>'; }
  }
  return result;
}

for (const target of ['/webmention','/webmention/test','/webmention-old-canary']) {
  test(`external receiver overlap is rejected without writes: ${target}`, async t => {
    const root = await fixture(t); const before = await snapshot(root);
    await assert.rejects(installTombstone(root,target), /external Webmention receiver/);
    assert.deepEqual(await snapshot(root), before);
  });
}

for (const source of ['blog/gone.js','blog/gone/index.ts','blog/[slug].js','blog/[[path]].ts','[[path]].js','blog/_middleware.js']) {
  test(`existing route is protected without writes: ${source}`, async t => {
    const root = await fixture(t);
    const filename = path.join(root,'functions',source);
    await mkdir(path.dirname(filename),{recursive:true});
    await writeFile(filename,'export function onRequest() {}\n');
    const before = await snapshot(root);
    await assert.rejects(installTombstone(root,'/blog/gone/'), /existing Function route/);
    assert.deepEqual(await snapshot(root), before);
  });
}

for (const rule of ['/blog/*','/blog/gone','/blog/gone/']) {
  test(`exclude precedence is respected without writes: ${rule}`, async t => {
    const root = await fixture(t,[rule]); const before = await snapshot(root);
    await assert.rejects(installTombstone(root,'/blog/gone/'), /excluded from Pages Functions/);
    assert.deepEqual(await snapshot(root), before);
  });
}

test('unrelated reply, API and media Functions coexist with one exact tombstone', async t => {
  const root = await fixture(t,['/private/*']);
  for (const source of ['reply/[id].js','api/webmentions.js','tweets/media/[[path]].js']) {
    const filename=path.join(root,'functions',source);
    await mkdir(path.dirname(filename),{recursive:true});
    await writeFile(filename,'export function onRequest() {}\n');
  }
  await installTombstone(root,'/blog/gone/');
  const routes = JSON.parse(await readFile(path.join(root,'static','_routes.json'),'utf8'));
  assert.deepEqual(routes.include,['/api/webmentions','/blog/gone','/blog/gone/']);
  assert.deepEqual(routes.exclude,['/private/*']);
});

test('route budget and overlong paths fail before creating a Function', async t => {
  for (const mode of ['budget','length']) {
    const root=await fixture(t);
    if(mode==='budget') await writeFile(path.join(root,'static','_routes.json'),JSON.stringify({version:1,include:Array.from({length:99},(_,i)=>'/old/'+i),exclude:[]}));
    const before=await snapshot(root);
    await assert.rejects(installTombstone(root,mode==='budget'?'/blog/gone':'/'+'a'.repeat(100)), /limit exceeded|100 characters/);
    assert.deepEqual(await snapshot(root),before);
  }
});


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

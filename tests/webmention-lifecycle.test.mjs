import { withReplyShell } from './helpers/reply-shell.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestGet as rawReply } from '../functions/reply/[id].js';

const originalFetch = globalThis.fetch;
const id = 'R'.repeat(32);
const context = () => ({
  request: new Request(`https://michaelreflects.com/reply/${id}/`),
  params: { id }, env: { WEBMENTION_HUB_ORIGIN: 'https://hub.example' },
});
test.afterEach(() => { globalThis.fetch = originalFetch; });

test('withdrawn reply is a no-store 410 with revision and no private text', async () => {
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.cf.cacheTtl, 0);
    assert.equal(options.cf.cacheEverything, false);
    return Response.json({ opaque_id: id, state: 'withdrawn', revision: 2, withdrawn_at: '2026-11-08T16:00:00Z' }, { status: 410 });
  };
  const response = await reply(context());
  assert.equal(response.status, 410);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const html = await response.text();
  assert.match(html, /class="h-entry" data-reply-revision="2"/);
  assert.match(html, /Reply withdrawn/);
  assert.doesNotMatch(html, /u-in-reply-to|root_target_url|body_text/);
});

test('published revision is available immediately without response caching', async () => {
  globalThis.fetch = async () => Response.json({
    opaque_id: id, revision: 3, body_text: 'Updated response',
    root_target_url: 'https://other.example/post', in_reply_to_url: 'https://other.example/post',
    published_at: '2026-11-07T12:00:00Z',
  });
  const response = await reply(context());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(await response.text(), /data-reply-revision="3"/);
});

test('origin outages return 503 instead of manufacturing a deleted reply', async () => {
  globalThis.fetch = async () => { throw new Error('origin offline'); };
  const response = await reply(context());
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('unknown reply remains 404', async () => {
  globalThis.fetch = async () => Response.json({ error: 'not_found' }, { status: 404 });
  assert.equal((await reply(context())).status, 404);
});

function reply(context) { return rawReply(withReplyShell(context)); }

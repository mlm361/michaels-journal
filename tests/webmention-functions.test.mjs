import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestGet as webmentions } from '../functions/api/webmentions.js';
import { onRequestGet as reply, escapeHtml, validId } from '../functions/reply/[id].js';

const originalFetch = globalThis.fetch;

test.afterEach(() => { globalThis.fetch = originalFetch; });

test('thread endpoint rejects foreign targets before origin fetch', async () => {
  globalThis.fetch = () => assert.fail('must not fetch');
  const response = await webmentions({
    request: new Request('https://michaelreflects.com/api/webmentions?target=https://evil.example/post'),
    env: {},
  });
  assert.equal(response.status, 400);
});

test('thread endpoint fails empty when the public origin is unavailable', async () => {
  globalThis.fetch = async () => { throw new Error('origin down'); };
  const target = 'https://michaelreflects.com/blog/test/';
  const response = await webmentions({
    request: new Request('https://michaelreflects.com/api/webmentions?target=' + encodeURIComponent(target)),
    env: {},
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { target, count: 0, entries: [] });
});

test('thread endpoint uses the narrow public origin without a browser-visible key', async () => {
  globalThis.fetch = async (url, options) => {
    assert.match(
      String(url),
      /^https:\/\/webmention-hub\.mitchelltribe\.xyz\/api\/public\/webmentions\?/,
    );
    assert.equal(options.headers['X-Public-Projection-Key'], undefined);
    return new Response(JSON.stringify({ entries: [{ event_type: 'like' }] }));
  };
  const target = 'https://michaelreflects.com/blog/test/';
  const response = await webmentions({
    request: new Request('https://michaelreflects.com/api/webmentions?target=' + encodeURIComponent(target)),
    env: {},
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).count, 1);
});

test('thread endpoint authenticates to origin and forwards only entries', async () => {
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /^https:\/\/hub\.example\/api\/public\/webmentions\?/);
    assert.equal(options.headers['X-Public-Projection-Key'], 'secret');
    return new Response(JSON.stringify({ entries: [{ event_type: 'like' }] }));
  };
  const target = 'https://michaelreflects.com/blog/test/';
  const response = await webmentions({
    request: new Request('https://michaelreflects.com/api/webmentions?target=' + encodeURIComponent(target)),
    env: { WEBMENTION_HUB_ORIGIN: 'https://hub.example', WEBMENTION_HUB_PROJECTION_KEY: 'secret' },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).count, 1);
});

test('reply page escapes hostile text and emits required microformats', async () => {
  const id = 'A'.repeat(32);
  globalThis.fetch = async () => new Response(JSON.stringify({
    body_text: '<script>alert(1)</script>',
    in_reply_to_url: 'https://reader.example/replies/parent/',
    root_target_url: 'https://michaelreflects.com/blog/root/',
    published_at: '2026-08-11T21:30:00+00:00',
  }));
  const response = await reply({
    request: new Request('https://michaelreflects.com/reply/' + id + '/'),
    params: { id },
    env: { WEBMENTION_HUB_ORIGIN: 'https://hub.example', WEBMENTION_HUB_PROJECTION_KEY: 'secret' },
  });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /class="h-entry"/);
  assert.match(html, /class="u-in-reply-to"/);
  assert.match(html, /https:\/\/reader\.example\/replies\/parent\//);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /noindex,nofollow,noarchive/);
});

test('reply page rejects a non-HTTP external reply target', async () => {
  const id = 'B'.repeat(32);
  globalThis.fetch = async () => new Response(JSON.stringify({
    body_text: 'safe text',
    in_reply_to_url: 'javascript:alert(1)',
    root_target_url: 'https://michaelreflects.com/blog/root/',
    published_at: '2026-08-11T21:30:00+00:00',
  }));
  const response = await reply({
    request: new Request('https://michaelreflects.com/reply/' + id + '/'),
    params: { id },
    env: { WEBMENTION_HUB_ORIGIN: 'https://hub.example' },
  });
  assert.equal(response.status, 404);
});

test('reply IDs are strict and HTML escaping covers attribute characters', () => {
  assert.equal(validId('x'.repeat(32)), true);
  assert.equal(validId('../not-an-id'), false);
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});

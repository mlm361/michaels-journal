import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { renderReplyPage } from '../functions/_shared/reply-page.js';
import { shell } from './helpers/reply-shell.mjs';
import { withReplyShell } from './helpers/reply-shell.mjs';

const threadSource = process.env.REPLY_THREADS_SOURCE || 'static/js/webmention-threading.js';

test('Hub full owned reply replaces a duplicate short copy in either input order', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(threadSource, 'utf8'), context);
  const full = 'First paragraph.\n\n' + 'Full reply '.repeat(200) + 'THE END';
  for (const reverse of [false, true]) {
    const cached = {url:'https://michaelreflects.com/reply/own/',content:{text:'First paragraph.…'}};
    const owned = {url:cached.url,'wm-id':'reply:owned','author-is-owner':true,content:{text:full}};
    const result = context.MichaelWebmentionThreads.dedupeChildren(reverse ? [owned,cached] : [cached,owned]);
    assert.equal(result.length, 1);
    assert.equal(result[0].content.text, full);
    assert.equal(result[0]['author-is-owner'], true);
    assert.equal(result[0]['wm-id'], 'reply:owned');
  }
});

test('an edited shorter own reply replaces stale longer text', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(threadSource, 'utf8'), context);
  const result = context.MichaelWebmentionThreads.dedupeChildren([
    {url:'https://michaelreflects.com/reply/own/',content:{text:'Old '.repeat(500)}},
    {url:'https://michaelreflects.com/reply/own/','wm-id':'reply:owned','author-is-owner':true,content:{text:'Current full answer.'}},
  ]);
  assert.equal(result[0].content.text, 'Current full answer.');
});

test('reply shell retains shared theme with nonce scripts, strips inline handlers and external scripts', async () => {
  const context = {
    request: new Request('https://michaelreflects.com/reply/test/'),
    env:{ASSETS:{fetch:async (url) => {
      assert.equal(url.pathname, '/reply-shell/');
      return new Response(shell.replace('</head>', '<script src="https://tracker.example/x.js"></script></head>'));
    }}},
  };
  const response = await renderReplyPage(context, '<article>Full response</article>', 'https://michaelreflects.com/reply/test/');
  const html = await response.text();
  assert.match(html, /class="top-nav"/);
  assert.match(html, /href="\/default.css"/);
  assert.match(html, /Full response/);
  assert.doesNotMatch(html, /HUB_REPLY_CONTENT|onload=|onclick=|tracker.example|reply-shell/);
  const nonce = /nonce="([^"]+)"/.exec(html)[1];
  assert.ok(response.headers.get('Content-Security-Policy').includes(`'nonce-${nonce}'`));
  assert.ok(!response.headers.get('Content-Security-Policy').includes("script-src 'unsafe-inline'"));
});

test('missing or oversized shared shell is refused instead of showing a broken page', async () => {
  for (const html of ['no slot', 'x'.repeat(256_001)]) {
    const context = {request:new Request('https://michaelreflects.com/reply/test/'),env:{ASSETS:{fetch:async () => new Response(html)}}};
    await assert.rejects(renderReplyPage(context, '<article>Reply</article>', 'https://michaelreflects.com/reply/test/'));
  }
});

test('reply Function renders inside the shared Journal shell', async () => {
  const { onRequestGet } = await import(process.env.REPLY_HANDLER_SOURCE || '../functions/reply/[id].js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({body_text:'My complete answer.',in_reply_to_url:'https://writer.example/post/',root_target_url:'https://michaelreflects.com/blog/post/',published_at:'2026-11-08T12:00:00Z'});
  try {
    const context = withReplyShell({request:new Request('https://michaelreflects.com/reply/'+'A'.repeat(32)+'/'),params:{id:'A'.repeat(32)},env:{}});
    const response = await onRequestGet(context);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /class="top-nav"/);
    assert.match(html, /href="\/default.css"/);
    assert.match(html, /My complete answer\./);
    assert.doesNotMatch(html, /Georgia,serif/);
  } finally { globalThis.fetch = originalFetch; }
});

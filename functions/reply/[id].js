import {
  fetchOriginJson,
  securityHeaders,
  validMichaelReflectsUrl,
  validReplyTargetUrl,
} from '../_shared/webmention-origin.js';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

// Same-origin, so the page's img-src 'self' allows it; absolute, so receivers
// that parse the h-card get a usable photo URL.
const AVATAR_URL = 'https://michaelreflects.com/img/avatar-stipple.avif';

// The Hub keeps the author's paragraphs. A blank line starts a new paragraph and
// a single line break stays a <br>, so receivers that read the HTML see the same
// shape as this page instead of one run-together block.
function bodyHtml(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => '<p>' + paragraph.split('\n').map((line) => escapeHtml(line.trim())).join('<br>\n') + '</p>')
    .join('\n');
}

function hostOf(value) {
  try {
    return new URL(String(value || '')).hostname.replace(/^www\./, '');
  } catch (_error) {
    return 'another site';
  }
}

function validId(value) {
  return /^[A-Za-z0-9_-]{32,80}$/.test(String(value || ''));
}

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: securityHeaders('text/plain; charset=utf-8', 'no-store'),
  });
}

function replyHtml(reply, canonicalUrl) {
  const body = bodyHtml(reply.body_text);
  const target = escapeHtml(reply.in_reply_to_url);
  const root = escapeHtml(reply.root_target_url);
  const published = escapeHtml(reply.published_at);
  const canonical = escapeHtml(canonicalUrl);
  // A reply in a conversation on the journal links back to that entry. A reply
  // that started on someone else's site (e.g. from Marginalia) has no journal
  // entry, so it names the post it answers instead.
  const context = validMichaelReflectsUrl(reply.root_target_url)
    ? `In reply to <a class="u-in-reply-to" href="${target}">this conversation</a> · <a href="${root}">View the original journal entry</a>`
    : `In reply to <a class="u-in-reply-to" href="${target}">this post on ${escapeHtml(hostOf(reply.in_reply_to_url))}</a>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><link rel="canonical" href="${canonical}">
<title>Reply from Michael · Michael's Journal</title>
<style>:root{color-scheme:light dark;--paper:#f7f2e7;--ink:#20251f;--muted:#667166;--accent:#245e3e;--line:#d8d1c2}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:18px/1.65 Georgia,serif}.page{width:min(760px,calc(100% - 2rem));margin:8vh auto}.brand{font:800 .76rem/1.2 system-ui,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--accent)}article{margin-top:1rem;padding:clamp(1.25rem,4vw,2.5rem);border:1px solid var(--line);border-radius:14px;background:color-mix(in srgb,var(--paper) 92%,white)}h1{font-size:clamp(1.5rem,4vw,2.2rem);line-height:1.2;margin:.2rem 0 1.5rem}.meta{font:500 .84rem/1.5 system-ui,sans-serif;color:var(--muted)}.reply{overflow-wrap:anywhere}.reply p{margin:0 0 1em}.avatar{width:1.5em;height:1.5em;border-radius:50%;vertical-align:-.3em;margin-right:.35em}a{color:var(--accent)}@media(prefers-color-scheme:dark){:root{--paper:#171b18;--ink:#e9e6dc;--muted:#adb7ae;--accent:#f7cf60;--line:#394139}}</style></head>
<body><main class="page"><div class="brand">Michael's Journal</div><article class="h-entry">
<h1>Reply from <span class="p-author h-card"><a class="u-url" href="https://michaelreflects.com/"><img class="u-photo avatar" src="${AVATAR_URL}" alt="" width="48" height="48"><span class="p-name">Michael</span></a></span></h1>
<div class="e-content reply">${body}</div>
<p class="meta">${context}</p>
<time class="dt-published meta" datetime="${published}">${published}</time><a class="u-url" hidden href="${canonical}"></a>
</article></main></body></html>`;
}

export async function onRequestGet(context) {
  const id = String(context.params.id || '');
  if (!validId(id)) return notFound();
  try {
    const reply = await fetchOriginJson(
      context,
      '/api/public/webmention-replies/' + encodeURIComponent(id),
    );
    // The Hub only serves replies Michael published. The root may be his own
    // journal entry or, for a reply started from Marginalia, the external post.
    if (!validReplyTargetUrl(reply.root_target_url)
        || !validReplyTargetUrl(reply.in_reply_to_url)) return notFound();
    const canonical = new URL(context.request.url);
    canonical.search = '';
    canonical.hash = '';
    return new Response(replyHtml(reply, canonical.toString()), {
      status: 200,
      headers: securityHeaders('text/html; charset=utf-8'),
    });
  } catch (_error) {
    return notFound();
  }
}

export { bodyHtml, escapeHtml, validId };

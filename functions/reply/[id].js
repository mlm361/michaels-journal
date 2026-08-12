import { fetchOriginJson, securityHeaders, validMichaelReflectsUrl } from '../_shared/webmention-origin.js';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
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
  const body = escapeHtml(reply.body_text);
  const target = escapeHtml(reply.in_reply_to_url);
  const root = escapeHtml(reply.root_target_url);
  const published = escapeHtml(reply.published_at);
  const canonical = escapeHtml(canonicalUrl);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><link rel="canonical" href="${canonical}">
<title>Reply from Michael · Michael's Journal</title>
<style>:root{color-scheme:light dark;--paper:#f7f2e7;--ink:#20251f;--muted:#667166;--accent:#245e3e;--line:#d8d1c2}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:18px/1.65 Georgia,serif}.page{width:min(760px,calc(100% - 2rem));margin:8vh auto}.brand{font:800 .76rem/1.2 system-ui,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--accent)}article{margin-top:1rem;padding:clamp(1.25rem,4vw,2.5rem);border:1px solid var(--line);border-radius:14px;background:color-mix(in srgb,var(--paper) 92%,white)}h1{font-size:clamp(1.5rem,4vw,2.2rem);line-height:1.2;margin:.2rem 0 1.5rem}.meta{font:500 .84rem/1.5 system-ui,sans-serif;color:var(--muted)}.reply{white-space:pre-wrap;overflow-wrap:anywhere}a{color:var(--accent)}@media(prefers-color-scheme:dark){:root{--paper:#171b18;--ink:#e9e6dc;--muted:#adb7ae;--accent:#f7cf60;--line:#394139}}</style></head>
<body><main class="page"><div class="brand">Michael's Journal</div><article class="h-entry">
<h1>Reply from <a class="p-author h-card" href="https://michaelreflects.com/">Michael</a></h1>
<p class="e-content reply">${body}</p>
<p class="meta">In reply to <a class="u-in-reply-to" href="${target}">this conversation</a> · <a href="${root}">View the original journal entry</a></p>
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
    if (!validMichaelReflectsUrl(reply.root_target_url)
        || !validMichaelReflectsUrl(reply.in_reply_to_url)) return notFound();
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

export { escapeHtml, validId };

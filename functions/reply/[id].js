import { renderReplyPage } from '../_shared/reply-page.js';
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
  return `<section class="post_container"><article class="h-entry" data-reply-revision="${Number(reply.revision) || 1}">
<h1 class="article_title">Reply from <span class="p-author h-card"><a class="u-url" href="https://michaelreflects.com/"><img class="u-photo avatar" src="${AVATAR_URL}" alt="" width="48" height="48"><span class="p-name">Michael</span></a></span></h1>
<p class="reply-meta">${context}</p>
<div class="e-content reply">${body}</div>
<time class="dt-published reply-meta" datetime="${published}">${published}</time><a class="u-url" hidden href="${canonical}"></a>
</article></section>`;
}

export async function onRequestGet(context) {
  const id = String(context.params.id || '');
  if (!validId(id)) return notFound();
  const canonical = new URL(context.request.url);
  canonical.search = '';
  canonical.hash = '';
  try {
    const reply = await fetchOriginJson(
      context,
      '/api/public/webmention-replies/' + encodeURIComponent(id),
      0,
      true,
    );
    if (reply.state === 'withdrawn' && reply.origin_status === 410
        && reply.opaque_id === id && Number.isSafeInteger(reply.revision) && reply.revision > 0) {
      return await renderReplyPage(context,
        `<section class="post_container"><article class="h-entry" data-reply-revision="${reply.revision}"><h1 class="article_title">Reply withdrawn</h1><p class="e-content">Michael withdrew this reply.</p></article></section>`,
        escapeHtml(canonical.toString()), 410);

    }
    if (reply.origin_status !== 200) {
      return new Response('Reply temporarily unavailable', {
        status: 503,
        headers: securityHeaders('text/plain; charset=utf-8', 'no-store'),
      });
    }
    // The Hub only serves replies Michael published. The root may be his own
    // journal entry or, for a reply started from Marginalia, the external post.
    if (!validReplyTargetUrl(reply.root_target_url)
        || !validReplyTargetUrl(reply.in_reply_to_url)) return notFound();
    return await renderReplyPage(context, replyHtml(reply, canonical.toString()), escapeHtml(canonical.toString()));
  } catch (error) {
    if (error.status === 404) return notFound();
    return new Response('Reply temporarily unavailable', {
      status: 503,
      headers: securityHeaders('text/plain; charset=utf-8', 'no-store'),
    });
  }
}

export { bodyHtml, escapeHtml, validId };

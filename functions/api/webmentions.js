import { fetchOriginJson, securityHeaders, validMichaelReflectsUrl } from '../_shared/webmention-origin.js';

function empty(target, reason = 'unavailable') {
  return new Response(JSON.stringify({ target, count: 0, entries: [] }), {
    status: 200,
    headers: {
      ...securityHeaders('application/json; charset=utf-8', 'public, max-age=15'),
      'X-Webmention-Projection': reason,
    },
  });
}

export async function onRequestGet(context) {
  const target = new URL(context.request.url).searchParams.get('target') || '';
  if (!validMichaelReflectsUrl(target)) {
    return new Response(JSON.stringify({ error: 'invalid_target' }), {
      status: 400,
      headers: securityHeaders('application/json; charset=utf-8', 'no-store'),
    });
  }
  try {
    const data = await fetchOriginJson(
      context,
      '/api/public/webmentions?target=' + encodeURIComponent(target),
    );
    return new Response(JSON.stringify({
      target,
      count: Array.isArray(data.entries) ? data.entries.length : 0,
      entries: Array.isArray(data.entries) ? data.entries : [],
    }), {
      status: 200,
      headers: {
        ...securityHeaders('application/json; charset=utf-8'),
        'X-Webmention-Projection': 'hub',
      },
    });
  } catch (_error) {
    // Engagement must never take the article down with it.
    return empty(target);
  }
}

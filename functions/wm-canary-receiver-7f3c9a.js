const EXPECTED_TARGET = 'https://michaels-journal.pages.dev/webmention-canary-sally-20260813-7f3c9a/';
const REPLY_SOURCE = /^https:\/\/michaelreflects\.com\/reply\/[A-Za-z0-9_-]{32,80}\/?$/;

function response(message, status) {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

export async function onRequestPost(context) {
  try {
    const form = await context.request.formData();
    const source = String(form.get('source') || '');
    const target = String(form.get('target') || '');
    if (!REPLY_SOURCE.test(source) || target !== EXPECTED_TARGET) {
      return response('TEST ONLY receiver rejected a non-canary source or target.', 400);
    }
    return response('TEST ONLY Webmention accepted; this receiver will be deleted.', 202);
  } catch (_error) {
    return response('TEST ONLY receiver requires form-encoded source and target.', 400);
  }
}

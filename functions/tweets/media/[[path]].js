// Twitter archive R2 media proxy.
// Binding: TWITTER_MEDIA (configured in Cloudflare Pages dashboard).
// Route scope enforced by /_routes.json -> only /tweets/media/* invokes Functions.

const TYPE_BY_EXT = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  gif:  'image/gif',
  mp4:  'video/mp4',
  webm: 'video/webm',
};

function guessType(key) {
  const i = key.lastIndexOf('.');
  if (i < 0) return 'application/octet-stream';
  return TYPE_BY_EXT[key.slice(i + 1).toLowerCase()] || 'application/octet-stream';
}

function badPath(parts) {
  if (!parts || parts.length === 0) return true;
  for (const p of parts) {
    if (!p) return true;                 // empty segment = leading/double slash
    if (p === '.' || p === '..') return true;
    if (p.indexOf('\\') !== -1) return true;
    if (p.indexOf('/') !== -1) return true;
  }
  return false;
}

export async function onRequestGet(context) {
  const parts = context.params.path;
  const path = Array.isArray(parts) ? parts : (parts ? [parts] : []);

  if (badPath(path)) {
    return new Response('Not found', { status: 404 });
  }

  const bucket = context.env.TWITTER_MEDIA;
  if (!bucket) {
    return new Response('Not found', { status: 404 });
  }

  const key = path.join('/');
  const obj = await bucket.get(key);
  if (!obj) {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers();
  const ct = (obj.httpMetadata && obj.httpMetadata.contentType) || guessType(key);
  headers.set('Content-Type', ct);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (obj.etag) headers.set('ETag', obj.etag);

  return new Response(obj.body, { status: 200, headers });
}

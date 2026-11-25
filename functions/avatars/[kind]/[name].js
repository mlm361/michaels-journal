// JOURNAL-CSP-01 Phase 2c (C1): self-hosted commenter avatars, read-only from R2.
// Binding: AVATARS (Pages production -> michaelreflects-avatars, preview ->
// michaelreflects-avatars-preview). Route scope: /_routes.json includes /avatars/*.
//
// Fail closed. A picture is served only while Blog Poster's manifest for its kind
// still lists it and the manifest's lease has not run out. The lease is anchored to
// the moment the source last confirmed the list (confirmed_at) and can never be
// longer than MAX_LEASE_MS after it. The browser cache ends by the same deadline.
// This Function never writes to the bucket and never uses the Cache API.
//
// Manifest (manifest/<kind>.json, written only by Blog Poster):
//   { version: 1, prefix: <kind>, revision, source_revision,
//     confirmed_at, generated_at, valid_until,   // RFC 3339 UTC, ending in "Z"
//     keys: [<64 lowercase hex>, ...] }

const KINDS = new Set(['engagement', 'webmention']);
const NAME_RE = /^[0-9a-f]{64}\.webp$/;
const KEY_RE = /^[0-9a-f]{64}$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

export const MAX_LEASE_MS = 120 * 60 * 1000;   // agreed maximum (Michael, 2026-11-25)
export const MAX_OBJECT_BYTES = 65536;
export const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
export const MIN_REMAINING_MS = 2000;
export const MAX_AGE_CAP_S = 300;

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

// A timestamp in the agreed shape that names a real instant, as milliseconds; else NaN.
export function parseTimestamp(value) {
  if (typeof value !== 'string' || !TIMESTAMP_RE.test(value)) return NaN;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return NaN;
  // Reject calendar overflow such as 2026-02-31, which some parsers roll forward.
  if (new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19)) return NaN;
  return ms;
}

// The manifest's deadline in ms if it is valid for `kind` and lists `stem`; else null.
export function manifestDeadline(manifest, kind, stem) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
  if (manifest.version !== 1 || manifest.prefix !== kind) return null;
  const confirmedAt = parseTimestamp(manifest.confirmed_at);
  const generatedAt = parseTimestamp(manifest.generated_at);
  const validUntil = parseTimestamp(manifest.valid_until);
  if (!Number.isFinite(confirmedAt) || !Number.isFinite(generatedAt) || !Number.isFinite(validUntil)) return null;
  if (validUntil > confirmedAt + MAX_LEASE_MS) return null;
  if (!Array.isArray(manifest.keys)) return null;
  let listed = false;
  for (const key of manifest.keys) {
    if (typeof key !== 'string' || !KEY_RE.test(key)) return null;
    if (key === stem) listed = true;
  }
  return listed ? validUntil : null;
}

async function readManifest(bucket, kind) {
  const object = await bucket.get(`manifest/${kind}.json`);
  if (!object || typeof object.size !== 'number' || object.size > MAX_MANIFEST_BYTES) return null;
  try {
    return JSON.parse(await object.text());
  } catch {
    return null;
  }
}

async function serve(context, head) {
  const kind = context.params.kind;
  const name = context.params.name;
  if (typeof kind !== 'string' || !KINDS.has(kind)) return notFound();
  if (typeof name !== 'string' || !NAME_RE.test(name)) return notFound();

  const bucket = context.env.AVATARS;
  if (!bucket) return notFound();

  const stem = name.slice(0, -'.webp'.length);
  const deadline = manifestDeadline(await readManifest(bucket, kind), kind, stem);
  if (deadline === null || Date.now() >= deadline) return notFound();

  const key = `${kind}/${name}`;
  const object = head ? await bucket.head(key) : await bucket.get(key);
  if (!object) return notFound();
  const contentType = object.httpMetadata && object.httpMetadata.contentType;
  if (contentType !== 'image/webp' || typeof object.size !== 'number' || object.size > MAX_OBJECT_BYTES) {
    return notFound();
  }

  // The real response boundary: measure what is left after the object fetch.
  const remainingMs = deadline - Date.now();
  if (remainingMs < MIN_REMAINING_MS) return notFound();
  const maxAge = Math.min(MAX_AGE_CAP_S, Math.max(0, Math.floor(remainingMs / 1000) - 1));

  const headers = new Headers();
  headers.set('Content-Type', 'image/webp');
  headers.set('Content-Length', String(object.size));
  headers.set('Cache-Control', `private, max-age=${maxAge}, must-revalidate`);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(head ? null : object.body, { status: 200, headers });
}

export async function onRequest(context) {
  const method = context.request ? context.request.method : 'GET';
  if (method === 'GET') return serve(context, false);
  if (method === 'HEAD') return serve(context, true);
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
}

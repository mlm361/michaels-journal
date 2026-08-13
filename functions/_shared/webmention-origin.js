const ALLOWED_TARGET_HOSTS = new Set(['michaelreflects.com', 'www.michaelreflects.com']);
const DEFAULT_PUBLIC_ORIGIN = 'https://webmention-hub.mitchelltribe.xyz';

export function validMichaelReflectsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:'
      && ALLOWED_TARGET_HOSTS.has(url.hostname.toLowerCase())
      && !url.username
      && !url.password;
  } catch (_error) {
    return false;
  }
}

export function validReplyTargetUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && Boolean(url.hostname)
      && !url.username
      && !url.password;
  } catch (_error) {
    return false;
  }
}

export function originConfig(env) {
  const origin = String(env.WEBMENTION_HUB_ORIGIN || DEFAULT_PUBLIC_ORIGIN).replace(/\/+$/, '');
  const key = String(env.WEBMENTION_HUB_PROJECTION_KEY || '');
  if (!origin || !/^https:\/\//i.test(origin)) return null;
  return { origin, key };
}

export async function fetchOriginJson(context, path, cacheTtl = 30) {
  const configured = originConfig(context.env || {});
  if (!configured) throw new Error('origin unavailable');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const headers = { 'Accept': 'application/json' };
    if (configured.key) headers['X-Public-Projection-Key'] = configured.key;
    const response = await fetch(configured.origin + path, {
      headers,
      signal: controller.signal,
      cf: { cacheTtl, cacheEverything: true },
    });
    if (!response.ok) {
      const error = new Error('origin rejected request');
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function securityHeaders(contentType, cacheControl = 'public, max-age=30') {
  return {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  };
}

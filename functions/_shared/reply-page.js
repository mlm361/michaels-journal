import { securityHeaders } from './webmention-origin.js';

const SLOT = '<!--HUB_REPLY_CONTENT-->';

async function boundedHtml(response) {
  if (!response.ok || !response.body) throw new Error('reply theme unavailable');
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 256_000) throw new Error('reply theme too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function renderReplyPage(context, article, canonical, status = 200) {
  const response = await context.env.ASSETS.fetch(new URL('/reply-shell/', context.request.url));
  let shell = await boundedHtml(response);
  if (shell.split(SLOT).length !== 2) throw new Error('reply theme slot missing');
  const nonce = crypto.randomUUID();
  // This is trusted, generated Zola markup. Third-party scripts are omitted;
  // the shared local theme scripts and inline theme setup receive a nonce.
  shell = shell.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_match, attributes, body) => {
    const source = /\bsrc=["']([^"']+)["']/i.exec(attributes);
    if (source) {
      const url = new URL(source[1], context.request.url);
      if (url.origin !== new URL(context.request.url).origin && url.hostname !== 'michaelreflects.com') return '';
      attributes = attributes.replace(source[0], `src="${url.pathname}${url.search}"`);
    }
    return `<script nonce="${nonce}"${attributes}>${body}</script>`;
  });
  shell = shell.replace(/(<(?:body|button)\b[^>]*?)\s(?:onload|onclick)="[^"]*"/gi, '$1');
  shell = shell.split('https://michaelreflects.com/reply-shell/').join(canonical);
  if (status === 410) shell = shell.replace('<title> Reply from Michael', '<title> Reply withdrawn');
  const html = shell.replace(SLOT, () => article);
  const headers = securityHeaders('text/html; charset=utf-8', 'no-store');
  headers['Content-Security-Policy'] = `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' https: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  return new Response(html, { status, headers });
}

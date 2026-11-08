export const shell = `<!doctype html><html><head><title> Reply from Michael | Michael's Journal </title><meta name="robots" content="noindex,nofollow,noarchive"><link rel="stylesheet" href="/default.css"><link rel="canonical" href="https://michaelreflects.com/reply-shell/"><script>window.themeReady=true;</script></head><body onload="main();"><nav class="top-nav"><button id="theme-toggle" onclick="toggleTheme()">Theme</button></nav><main><!--HUB_REPLY_CONTENT--></main><footer>Michael's Journal</footer></body></html>`;
export function withReplyShell(context) {
  return { ...context, env: { ...context.env, ASSETS: { fetch: async () => new Response(shell) } } };
}

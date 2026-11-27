// JOURNAL-CSP-01 Phase 3 step 2: mount the footer TownSquare (was inline module base.2).
// The template writes the origin, socket path and optional site key as data-ts-*
// attributes on #townsquare-root. Loaded with type="module".
const root = document.getElementById('townsquare-root');
const origin = root ? root.getAttribute('data-ts-origin') : '';
if (origin) {
  const { mountTownSquare } = await import(origin + '/townsquare.mjs');
  // Load the widget stylesheet at runtime. It uses valid modern CSS (container
  // queries, vector-effect) that the W3C validator flags as errors; injecting it via
  // JS keeps that third-party CSS out of static validation so our own CSS is checked.
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = origin + '/widget.css';
  document.head.appendChild(css);
  const options = {
    serverOrigin: origin,
    socketPath: root.getAttribute('data-ts-socket-path') || '/live',
  };
  const siteKey = root.getAttribute('data-ts-site-key');
  if (siteKey) options.siteKey = siteKey;
  // Signposts (neighbouring towns) come live from the TownSquare dashboard.
  // Do not list connections here: an inline list overrides the dashboard.
  options.theme = 'host';
  mountTownSquare(root, options);
}

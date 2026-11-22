# JOURNAL-CSP-01 Phase 2a: the policy in Report-Only mode

Phase 2a sends `csp/phase2.policy` as `Content-Security-Policy-Report-Only` on every static
page (`static/_headers`, path `/*`). Browsers evaluate it and report violations in the
console and to `securitypolicyviolation` listeners. **Nothing is blocked.** There is no
report collector (plan v1 §4: no new third party).

`tools/pages-build.sh` declares `CSP_PHASE=2a-report-only`. The build fails unless the built
`public/_headers` has exactly one Report-Only line, for `/*`, equal to the policy file, and
no enforcing CSP line.

## Why each source is allowed

Inventory: a local build of `5864c3f7` (1,305 pages) parsed with `inventory.py`, plus every
runtime load in `static/js`, the templates and the content pages (fetch, import, WebSocket,
`.src =`). The Report-Only crawls confirm or prune this list before Phase 2b.

| Directive | Source | Why |
|---|---|---|
| default-src | `'self'` | everything not listed below |
| script-src | `'self'` | site scripts, Cloudflare email-decode (`/cdn-cgi/`) |
| | `'unsafe-inline'` | 1,121 distinct inline scripts, 2,614 `onclick`, 1,300 `onload` (removed in Phase 3) |
| | `https://tinylytics.app` | analytics script on every page |
| | `https://townsquare.michaelreflects.com` | `townsquare.mjs` module (`base.html:540`) |
| | `https://bubbles.town` | `vote-v1.js` via `bubbles-vote-loader.js` (SRI-pinned) |
| | `https://static.cloudflareinsights.com` | Cloudflare Web Analytics beacon, injected at the edge (Michael: keep) |
| style-src | `'self'` `'unsafe-inline'` | 5,903 `style=""` attributes, 17 `<style>` blocks |
| | `https://townsquare.michaelreflects.com` | `widget.css`, added at runtime |
| img-src | `'self'` `data:` | site images, inline data images |
| | `https://media.mitchelltribe.xyz` | gallery, imports, Nostr icon (4,705 refs) |
| | `https://img.youtube.com` | video thumbnails |
| | `https://www.themoviedb.org` | posters |
| | `https://cdn.uploads.micro.blog` `https://i.snap.as` `https://mitchelltribe.com` `https://scribbles.page` | images in older posts |
| | `https://cdn.bsky.app` | post images and Bluesky avatars in webmentions |
| | `https://coverartarchive.org` `https://*.archive.org` | now-playing cover art (and its redirect hosts) |
| | `https://tinylytics.app` | Tinylytics images, if any (kept only if seen) |
| | `https://mitchelltribe.social` `https://mitchelltribe.rodeo` `https://cdn.masto.host` `https://image.nostr.build` | webmention author avatars found in `public/engagement/*.json` |
| | `https://avatars.webmention.io` | webmention.io's avatar proxy for `/api/webmentions` results |
| media-src | `'self'` `https://media.mitchelltribe.xyz` | video and audio |
| frame-src | `https://www.youtube.com` `https://www.youtube-nocookie.com` `https://mitchelltribe.tube` | embeds (31, 1, 1 pages) |
| connect-src | `'self'` | engagement JSON, search index, `/weather.json`, `/api/webmentions`, `/tweets-data/` |
| | `https://tinylytics.app` | hits and kudos |
| | `https://townsquare.michaelreflects.com` `wss://townsquare.michaelreflects.com` | TownSquare API and `/live` socket |
| | `https://api.listenbrainz.org` | now playing (`post-share.html:101`) |
| | `https://coverartarchive.org` | cover-art lookups |
| | `https://bubbles.town` | vote API |
| font-src | `'self'` | self-hosted fonts |
| object-src | `'none'` | no plugins |
| base-uri | `'self'` | |
| form-action | `'self'` | |
| frame-ancestors | `'none'` | matches `X-Frame-Options: DENY` |
| | `upgrade-insecure-requests` | browsers ignore it in Report-Only; it takes effect in 2b |

**Not added yet:** `connect-src https://cloudflareinsights.com`. It's added only if a live
crawl captures a successful beacon POST to it (plan v3 R2-F2).

## Open for Phase 2b (decide before enforcing)

1. **Webmention avatars from new hosts.** Avatars come from whatever server each commenter
   uses. Under enforcement, an avatar from an unlisted host won't load (the card falls back to
   a broken image). Options: keep a list and accept that; proxy avatars same-origin; or
   allow `img-src https:`, which gives up image-based exfiltration protection.
2. **Preview `base_url`.** Zola's `base_url` is `https://michaelreflects.com`, so preview
   deployments load CSS, scripts and icons from production. Under an enforcing policy on a
   preview, those loads are cross-origin and blocked. Enforcing-preview tests (2b, 3) need
   preview builds with their own base URL.

## Release and rollback

- **Release:** merge to `master`. Pages builds with the unchanged dashboard command
  (`bash tools/pages-build.sh`); this revision's script declares and checks Phase 2a.
- **Rollback:** revert the merge. The previous revision declares `CSP_PHASE=none` and has
  no CSP line, so it builds and passes under the same command. No dashboard change.
- Report-Only can't block anything, so a 2a release can't break a page. The risk is
  limited to the header itself, which the build gate checks.

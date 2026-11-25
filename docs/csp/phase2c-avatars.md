# JOURNAL-CSP-01 Phase 2c: self-hosted avatars

Commenter avatars (social replies synced by Blog Poster, and Hub webmentions) are copied into a
dedicated private R2 bucket and served same-origin from `/avatars/<kind>/<sha256(url)>.webp`, so the
five remote avatar hosts can leave `img-src`. Bluesky avatars stay on `cdn.bsky.app`.

## Pieces
| Piece | Where | Step |
|---|---|---|
| Buckets `michaelreflects-avatars` (prod) and `michaelreflects-avatars-preview` | Cloudflare R2, private | 0 |
| Pages binding `AVATARS` (production → prod bucket, preview → preview bucket) | Pages project settings | 0 |
| Function `functions/avatars/[kind]/[name].js`, route `/avatars/*` | this repo | C1 |
| Transitional reader: `authorPhoto()` in `themes/ergo/templates/partials/webmentions.html` | this repo | C1 |
| Writer: avatar job, manifests, ledger (the only writer) | Blog Poster on pi5 | 2 |
| Eligibility push for webmention avatars | Hub on pi5 | 3 |
| Strict reader (same-origin or `cdn.bsky.app` only) | this repo | C2 |
| Drop the 5 hosts from `img-src` | this repo | D |

## The serving rule (fail closed)
The Function serves `<kind>/<name>` only when all of these hold; anything else is `404` with
`Cache-Control: no-store`:
- `kind` is `engagement` or `webmention`; `name` matches `^[0-9a-f]{64}\.webp$` (checked before R2 is touched);
- `manifest/<kind>.json` parses, `version == 1`, `prefix == kind`, `confirmed_at`, `generated_at` and
  `valid_until` are RFC 3339 UTC timestamps ending in `Z`, `valid_until <= confirmed_at + 120 min`,
  every entry of `keys` is 64 lowercase hex, and the name's hash is in `keys`;
- now is before `valid_until`;
- the object exists, is `image/webp` and is at most 65,536 bytes;
- after the object fetch, at least 2 seconds remain before `valid_until`.

Response headers: `Content-Type: image/webp`, `Cache-Control: private, max-age=<min(300, max(0,
floor(seconds left) - 1))>, must-revalidate`, `X-Content-Type-Options: nosniff`,
`Content-Security-Policy: default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: same-origin`.
GET and HEAD only (others 405). No Cache API, no edge cache rule, never writes.

So no browser keeps a picture past the manifest deadline, and the deadline is never more than
120 minutes after the source last confirmed the list. Blog Poster writes the manifest; rewriting it
from the same confirmation cannot move the deadline.

## Manifest shape (written by Blog Poster, step 2)
```json
{ "version": 1, "prefix": "webmention", "revision": "...", "source_revision": "...",
  "confirmed_at": "2026-11-25T12:00:00Z", "generated_at": "2026-11-25T12:05:00Z",
  "valid_until": "2026-11-25T14:00:00Z", "keys": ["<64 hex>", "..."] }
```

## Tests
`tests/csp-avatars.test.mjs` (part of `npm run test:security`). Contract: plan v5 §4 and Sally's
2026-11-25 0934 lease amendment.

# JOURNAL-CSP-01 Phase 0: Pages build baseline

Read from the Cloudflare Pages API (project `michaels-journal`) on 2026-11-22 with a read-only token. These values are the baseline that every later CSP phase is compared against. Secret variables are listed by name only.

## Build command (verbatim)

<!-- baseline-command -->
```sh
set -eu; archive="$(mktemp)"; zola_dir="$(mktemp -d)"; curl -fsSL -o "$archive" "https://github.com/getzola/zola/releases/download/v0.23.6/zola-v0.23.6-x86_64-unknown-linux-gnu.tar.gz"; printf '%s  %s\n' '8f5132b3522412d04e395e0b25f6d68613ad272a873e54a2b3ebf664873024a4' "$archive" | sha256sum -c -; tar -xzf "$archive" -C "$zola_dir"; "$zola_dir/zola" --version; "$zola_dir/zola" build
```

- SHA-256 of the command string: `87e2f598f966378cda9efec3bc9123963114c03fb3367812e3fba9ed89fd39a8` (386 bytes, no newline).
- The Zola hash equals GitHub's published digest for `zola-v0.23.6-x86_64-unknown-linux-gnu.tar.gz` (release published 2026-09-12).

## Other settings

| Setting | Value |
|---|---|
| Build output directory | `public` |
| Root directory | (empty: repository root) |
| Production branch | `master` (GitHub source) |
| Preview deployments | all branches (`*`), none excluded; PR comments on |
| Build image | v3 |
| Production variables | `ZOLA_VERSION=0.23.6`; `WEATHER_PUSH_TOKEN` (secret) |
| Production bindings | KV `WEATHER_KV`; R2 `TWITTER_MEDIA` |
| Preview variables | `ZOLA_VERSION=0.23.6` only; no KV or R2 bindings |

Preview deployments therefore have no weather data or archived tweet media. Checks on previews must not read those as failures.

## What Phase 0 changes

`tools/pages-build.sh` runs the same commands, one per line, under `set -euo pipefail`, declares `CSP_PHASE=none`, then always runs `node tools/csp-headers-check.mjs "$CSP_PHASE" public/_headers`. For `none`, the built `_headers` must exist and set no `Content-Security-Policy` or `Content-Security-Policy-Report-Only` header on any path.

## Release and rollback

1. Merge Phase 0 while the dashboard still runs the baseline command (the new files are unused).
2. Michael changes the dashboard build command to `bash tools/pages-build.sh`; one production build confirms it.
3. **Rollback:** restore the baseline command above in the dashboard **first**, then revert the merge. Only Phase 0 needs the dashboard for rollback; every later revision keeps the script.

# csp-retention-check (pi5)

Reads `retention_status` (one row, written by `workers/csp-retention` after BOTH stores prune and
verify) from the production CSP D1 database through Cloudflare's D1 query API with a **read-only**
D1 token, and pushes UP or DOWN to Uptime Kuma push monitor #52 on the LAN. Kuma stays LAN-only.

- UP: the row exists, `last_ok_at` and `scheduled_at` are ISO-8601 UTC, `keep_from` is a date, and
  the age is between -5 min and 26 h.
- DOWN with a reason code: `missing`, `stale_<n>h`, `future`, `malformed`, `auth`, `http_<n>`,
  `api_error`, `network`, `config`. Messages never include a token, a response body or headers.
- Kuma #52 push interval: 10,800 s (3 h), so a stopped poller also alerts.

## Install (user units, pi5)
1. `~/csp-retention-check/csp_retention_check.py` (copy from this folder; mode 0644).
2. `~/.config/csp-retention-check/env` (directory 0700, file 0600), keys only:
   `CSP_D1_READ_TOKEN`, `CSP_CF_ACCOUNT_ID`, `CSP_PROD_D1_ID`, `CSP_KUMA_PUSH_URL`
   (the push URL is `http://127.0.0.1:3001/api/push/<token>`; any query is replaced).
3. `~/.config/systemd/user/csp-retention-check.{service,timer}`, then
   `systemctl --user daemon-reload && systemctl --user enable --now csp-retention-check.timer`.
4. Prove the alert path: `--fixture stale` (a real DOWN to #52, Gotify delivers), then
   `--fixture fresh` or a normal run (UP). Neither disables a check.

## Tests
`python3 -m unittest discover -s ops/csp-retention-check` (standard library only).

# csp-retention-check (pi5)

Reads `retention_status` (one row, written by `workers/csp-retention` only after BOTH stores prune
and verify) from the production CSP D1 database through Cloudflare's D1 query API with a
**read-only** D1 token, and pushes UP or DOWN to Uptime Kuma push monitor #52 on the LAN. Kuma
stays LAN-only.

**UP needs a real receipt:**
- the envelope and the statement both report success;
- `cron` is `17 3 * * *`;
- `scheduled_at` is from 03:17:00 up to, not including, 03:32:00 UTC (Cloudflare's `scheduledTime` trails the cron instant: the first prod run said 03:17:41);
- `last_ok_at` is 0 to 15 min after it;
- `keep_from` is the scheduled UTC day minus 30;
- nothing is more than 5 min in the future;
- the **scheduled** run is under 26 h old.

**DOWN reason codes:** `missing`, `stale_<n>h`, `future`, `receipt`, `cron`, `keep_from`, `malformed`, `auth`, `http_<n>`, `api_error`, `network`, `config`, `internal` (an unforeseen error while deciding; still pushed). Age and future checks run before any date arithmetic, so an extreme timestamp is DOWN, never a crash. Messages never include a token, a response body or headers.

**Safety:**
- redirects are never followed, on D1 or on Kuma;
- 401 and 403 are decided from the status, and the body is never read;
- other error bodies are read bounded and guarded;
- `CSP_KUMA_PUSH_URL` must be exactly `http://127.0.0.1:3001/api/push/<token>`, or the poller exits 2 without any network call.

**What the Worker's stamp guarantees:** the table's CHECKs validate every stored column, and the write only moves the receipt forward (a late, older invocation leaves a newer one). If D1's reply is lost or malformed after the write, the Worker re-reads: its own exact receipt or a newer one counts as success. A Worker error never means "the previous row is still there"; the log says what the re-read found, or that the outcome is unknown. The poller judges whatever row is stored.

**Kuma #52:** push interval 10,800 s (3 h), so a stopped poller also alerts.

## Rollout (the approved evidence sequence; each step under its own authorization)
1. Apply `csp/d1-prod-retention-status.sql` to csp-reports-prod. Check `PRAGMA table_info`, the stored CHECKs (`sqlite_master.sql` matches the file) and the `agg` counts on both stores, before and after.
2. Release the Worker. Check the version id, the cron unchanged and both bindings.
3. **Install, without enabling the timer.** #52 stays **paused**.
   - `~/csp-retention-check/csp_retention_check.py` (0644);
   - `~/.config/csp-retention-check/env` (directory 0700, file 0600), with keys only: `CSP_D1_READ_TOKEN`, `CSP_CF_ACCOUNT_ID`, `CSP_PROD_D1_ID`, `CSP_KUMA_PUSH_URL`;
   - `~/.config/systemd/user/csp-retention-check.{service,timer}`, then `systemctl --user daemon-reload`.
4. **After the first scheduled 03:17 UTC run:**
   - read the stamp, and confirm `scheduled_at` is that run and both stores' rows are present;
   - run the poller with `--dry-run` against real D1, which must print `up ok run <that run>`.
5. Set #52's interval to 10,800 s and resume it. Run one **real** poll (UP), then `systemctl --user enable --now csp-retention-check.timer`.
6. **Alert proof:**
   - `--fixture stale` pushes a real DOWN to #52, and Gotify delivers it (capture it, redacted);
   - **recovery is a normal real poll** (UP). There is no "fresh" fixture: a canned answer can't certify recovery.

## Tests
`python3 -m unittest discover -s ops/csp-retention-check` (standard library only; offline, with one loopback HTTP server for the no-redirect check).

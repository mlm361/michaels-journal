#!/usr/bin/env python3
"""JOURNAL-CSP-01: check the csp-retention Worker's last success stamp and push it to Uptime Kuma.

Runs on pi5 from a systemd user timer (every 2 h). It reads one row from the production CSP D1
database through Cloudflare's D1 query API with a READ-ONLY token, decides UP or DOWN, and pushes
the result to Kuma push monitor #52 on the LAN. Kuma's own push interval (3 h) alerts if this
poller stops.

Configuration comes from the environment (systemd EnvironmentFile, 0600):
  CSP_D1_READ_TOKEN   Cloudflare token with D1 Read only (never logged)
  CSP_CF_ACCOUNT_ID   Cloudflare account id
  CSP_PROD_D1_ID      csp-reports-prod database id
  CSP_KUMA_PUSH_URL   exactly http://127.0.0.1:3001/api/push/<token> (never logged; any query is
                      replaced)

UP needs a real receipt: statement success, cron 17 3 * * *, scheduled in 03:17:00-03:31:59 UTC (Cloudflare's
scheduledTime carries dispatch jitter: the first prod run said 03:17:41), completed 0-15 min after that, keep_from = scheduled day - 30, nothing over 5 min in the future, and the
SCHEDULED run under 26 h old. Anything else, including an unforeseen error while deciding, pushes
DOWN. Redirects are never followed, and 401/403 bodies are never read.

Messages carry reason codes only, never a token, a response body or headers. Standard library only.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

API = 'https://api.cloudflare.com/client/v4'
SQL = 'SELECT last_ok_at, scheduled_at, cron, keep_from FROM retention_status WHERE id = 1'
CRON = '17 3 * * *'           # workers/csp-retention/wrangler.toml
RETENTION_DAYS = 30           # workers/csp-retention/index.js RETENTION_DAYS
MAX_AGE = timedelta(hours=26)  # measured from the SCHEDULED run, so an old run can't mask a missed one
FUTURE_SLACK = timedelta(minutes=5)
MAX_RUN = timedelta(minutes=15)  # scheduled -> completion; a Cron Trigger invocation is far shorter
SCHED_JITTER = timedelta(minutes=15)  # scheduledTime may trail 03:17:00 (2026-11-25 prod: 03:17:41)
KUMA_HOST, KUMA_PORT = '127.0.0.1', 3001
D1_TIMEOUT = 15
PUSH_TIMEOUT = 10
REQUIRED = ('CSP_D1_READ_TOKEN', 'CSP_CF_ACCOUNT_ID', 'CSP_PROD_D1_ID', 'CSP_KUMA_PUSH_URL')


def _parse_utc(value):
    if not isinstance(value, str) or not value.endswith('Z'):
        return None
    try:
        parsed = datetime.fromisoformat(value[:-1] + '+00:00')
    except ValueError:
        return None
    return parsed if parsed.tzinfo else None


def decide(http_status, payload, now):
    """Return (status, reason) for one D1 query outcome. status is 'up' or 'down'."""
    if http_status in (401, 403):
        return 'down', 'auth'
    errors = payload.get('errors') if isinstance(payload, dict) else None
    if isinstance(errors, list) and any('no such table' in str(e.get('message', '')) for e in errors if isinstance(e, dict)):
        return 'down', 'missing'
    if http_status != 200:
        return 'down', f'http_{http_status}'
    if not isinstance(payload, dict) or payload.get('success') is not True:
        return 'down', 'api_error'
    try:
        statement = payload['result'][0]
        rows = statement['results']
    except (KeyError, IndexError, TypeError):
        return 'down', 'malformed'
    if not isinstance(statement, dict) or statement.get('success') is not True:
        return 'down', 'api_error'
    if not isinstance(rows, list):
        return 'down', 'malformed'
    if not rows:
        return 'down', 'missing'
    row = rows[0] if isinstance(rows[0], dict) else {}
    last_ok = _parse_utc(row.get('last_ok_at'))
    scheduled = _parse_utc(row.get('scheduled_at'))
    if last_ok is None or scheduled is None:
        return 'down', 'malformed'
    if row.get('cron') != CRON:
        return 'down', 'cron'
    # The scheduled time must belong to a cron firing: from 03:17:00 UTC on its own day up to,
    # not including, 03:32:00. Cloudflare's scheduledTime is not the exact cron instant (the
    # first prod run reported 03:17:41), so an exact-second rule would never be UP ...
    offset = timedelta(hours=scheduled.hour, minutes=scheduled.minute, seconds=scheduled.second,
                       microseconds=scheduled.microsecond) - timedelta(hours=3, minutes=17)
    if not (timedelta(0) <= offset < SCHED_JITTER):
        return 'down', 'receipt'
    # ... completed after it was scheduled, within one invocation ...
    if not (timedelta(0) <= last_ok - scheduled <= MAX_RUN):
        return 'down', 'receipt'
    # Age and future checks come BEFORE any date arithmetic on the receipt, so an extreme but
    # parseable timestamp (year 1, year 9999) is DOWN, never an overflow (Sally R2 P2).
    if last_ok - now > FUTURE_SLACK or scheduled - now > FUTURE_SLACK:
        return 'down', 'future'
    age = now - scheduled
    if age >= MAX_AGE:
        return 'down', f'stale_{int(age.total_seconds() // 3600)}h'
    # ... with the Worker's cutoff rule: keep_from = scheduled UTC day - RETENTION_DAYS.
    try:
        expected_keep_from = (scheduled.date() - timedelta(days=RETENTION_DAYS)).isoformat()
    except OverflowError:
        return 'down', 'malformed'
    if row.get('keep_from') != expected_keep_from:
        return 'down', 'keep_from'
    return 'up', f'ok run {scheduled.strftime("%Y-%m-%dT%H:%MZ")} age {max(0, int(age.total_seconds() // 60))}m'


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never follow a redirect: the D1 token and the push token stay bound to their fixed endpoints."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def _read_bounded(resp_or_error):
    try:
        return resp_or_error.read(65536)
    except Exception:  # noqa: BLE001 - an unreadable body is treated as no body
        return None


def kuma_url_ok(base):
    """The push destination must be the documented loopback Kuma: http://127.0.0.1:3001/api/push/<token>."""
    try:
        parts = urllib.parse.urlsplit(base)
        port = parts.port
    except ValueError:
        return False
    token = parts.path[len('/api/push/'):]
    return (parts.scheme == 'http' and parts.hostname == KUMA_HOST and port == KUMA_PORT
            and parts.username is None and parts.password is None
            and parts.path.startswith('/api/push/') and bool(token) and '/' not in token)


def query_d1(env, opener=None):
    """POST the fixed query. Returns (http_status, payload or None). Network errors -> (None, None)."""
    opener = opener or _OPENER.open
    url = f"{API}/accounts/{env['CSP_CF_ACCOUNT_ID']}/d1/database/{env['CSP_PROD_D1_ID']}/query"
    req = urllib.request.Request(url, data=json.dumps({'sql': SQL}).encode(), method='POST', headers={
        'Authorization': 'Bearer ' + env['CSP_D1_READ_TOKEN'],
        'Content-Type': 'application/json',
        'User-Agent': 'csp-retention-check',
    })
    try:
        with opener(req, timeout=D1_TIMEOUT) as resp:
            status = resp.status
            body = _read_bounded(resp)
            if body is None:
                return None, None
    except urllib.error.HTTPError as exc:
        status = exc.code
        if status in (401, 403):  # decided from the status alone; the body is never read
            return status, None
        body = _read_bounded(exc)
    except (urllib.error.URLError, OSError, TimeoutError, ValueError):
        return None, None
    if body is None:
        return status, None
    try:
        return status, json.loads(body)
    except ValueError:
        return status, None


def push_url(base, status, msg):
    """Kuma push URL with our own query (status, msg); any query in the configured URL is dropped."""
    parts = urllib.parse.urlsplit(base)
    query = urllib.parse.urlencode({'status': status, 'msg': msg[:120], 'ping': ''})
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, query, ''))


def push(base, status, msg, opener=None):
    opener = opener or _OPENER.open
    try:
        with opener(push_url(base, status, msg), timeout=PUSH_TIMEOUT) as resp:
            return 200 <= resp.status < 300
    except (urllib.error.URLError, OSError, TimeoutError, ValueError):
        return False


def fixture(kind, now):
    """A canned, real-shaped D1 answer whose receipt is about 27 h old (alert-path proof only)."""
    assert kind == 'stale'
    day = (now - timedelta(hours=27)).date()
    scheduled = datetime(day.year, day.month, day.day, 3, 17, tzinfo=timezone.utc)
    if now - scheduled < MAX_AGE:
        scheduled -= timedelta(days=1)
    done = scheduled + timedelta(seconds=4)
    return 200, {'success': True, 'errors': [], 'messages': [], 'result': [{'success': True, 'meta': {}, 'results': [{
        'last_ok_at': done.strftime('%Y-%m-%dT%H:%M:%S.000Z'), 'scheduled_at': scheduled.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        'cron': CRON, 'keep_from': (scheduled.date() - timedelta(days=RETENTION_DAYS)).isoformat()}]}]}


def main(argv=None, env=None, now=None, opener=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--fixture', choices=('stale',),
                    help='skip D1 and push DOWN for a canned, about 27 h old receipt (alert-path proof only)')
    ap.add_argument('--dry-run', action='store_true', help='print the decision; do not push')
    args = ap.parse_args(argv)
    env = os.environ if env is None else env
    now = now or datetime.now(timezone.utc)
    missing = [k for k in REQUIRED if not env.get(k)]
    if 'CSP_KUMA_PUSH_URL' in missing or not kuma_url_ok(env['CSP_KUMA_PUSH_URL']):
        print('csp-retention-check: CSP_KUMA_PUSH_URL must be http://127.0.0.1:3001/api/push/<token>', file=sys.stderr)
        return 2
    if missing:
        status, reason = 'down', 'config'
    elif args.fixture:
        status, reason = decide(*fixture(args.fixture, now), now)
        reason = f'fixture {args.fixture}: {reason}'
    else:
        http_status, payload = query_d1(env, opener)
        if http_status is None:
            status, reason = 'down', 'network'
        else:
            try:
                status, reason = decide(http_status, payload, now)
            except Exception:  # noqa: BLE001 - any unforeseen receipt still reaches Kuma as DOWN
                status, reason = 'down', 'internal'
    print(f'csp-retention-check: {status} {reason}')
    if args.dry_run:
        return 0
    if not push(env['CSP_KUMA_PUSH_URL'], status, reason, opener):
        print('csp-retention-check: Kuma push failed', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

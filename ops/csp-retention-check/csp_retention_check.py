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
  CSP_KUMA_PUSH_URL   http://127.0.0.1:3001/api/push/<token> (never logged; any query is replaced)

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
SQL = 'SELECT last_ok_at, scheduled_at, keep_from FROM retention_status WHERE id = 1'
MAX_AGE = timedelta(hours=26)
FUTURE_SLACK = timedelta(minutes=5)
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
        rows = payload['result'][0]['results']
    except (KeyError, IndexError, TypeError):
        return 'down', 'malformed'
    if not isinstance(rows, list):
        return 'down', 'malformed'
    if not rows:
        return 'down', 'missing'
    row = rows[0] if isinstance(rows[0], dict) else {}
    last_ok = _parse_utc(row.get('last_ok_at'))
    scheduled = _parse_utc(row.get('scheduled_at'))
    try:
        date.fromisoformat(str(row.get('keep_from')))
    except ValueError:
        return 'down', 'malformed'
    if last_ok is None or scheduled is None:
        return 'down', 'malformed'
    age = now - last_ok
    if age < -FUTURE_SLACK:
        return 'down', 'future'
    if age >= MAX_AGE:
        return 'down', f'stale_{int(age.total_seconds() // 3600)}h'
    return 'up', f'ok age {max(0, int(age.total_seconds() // 60))}m run {scheduled.strftime("%Y-%m-%dT%H:%MZ")}'


def query_d1(env, opener=urllib.request.urlopen):
    """POST the fixed query. Returns (http_status, payload or None). Network errors -> (None, None)."""
    url = f"{API}/accounts/{env['CSP_CF_ACCOUNT_ID']}/d1/database/{env['CSP_PROD_D1_ID']}/query"
    req = urllib.request.Request(url, data=json.dumps({'sql': SQL}).encode(), method='POST', headers={
        'Authorization': 'Bearer ' + env['CSP_D1_READ_TOKEN'],
        'Content-Type': 'application/json',
        'User-Agent': 'csp-retention-check',
    })
    try:
        with opener(req, timeout=D1_TIMEOUT) as resp:
            status, body = resp.status, resp.read(65536)
    except urllib.error.HTTPError as exc:
        status, body = exc.code, exc.read(65536)
    except (urllib.error.URLError, OSError, TimeoutError):
        return None, None
    try:
        return status, json.loads(body)
    except ValueError:
        return status, None


def push_url(base, status, msg):
    """Kuma push URL with our own query (status, msg); any query in the configured URL is dropped."""
    parts = urllib.parse.urlsplit(base)
    query = urllib.parse.urlencode({'status': status, 'msg': msg[:120], 'ping': ''})
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, query, ''))


def push(base, status, msg, opener=urllib.request.urlopen):
    try:
        with opener(push_url(base, status, msg), timeout=PUSH_TIMEOUT) as resp:
            return 200 <= resp.status < 300
    except (urllib.error.URLError, OSError, TimeoutError):
        return False


def fixture(kind, now):
    ages = {'fresh': timedelta(hours=1), 'stale': timedelta(hours=27)}
    stamp = (now - ages[kind]).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    return 200, {'success': True, 'result': [{'results': [
        {'last_ok_at': stamp, 'scheduled_at': stamp, 'keep_from': '2026-01-01'}]}]}


def main(argv=None, env=None, now=None, opener=urllib.request.urlopen):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--fixture', choices=('fresh', 'stale'),
                    help='skip D1 and push the decision for a canned stamp (alert-path proof)')
    ap.add_argument('--dry-run', action='store_true', help='print the decision; do not push')
    args = ap.parse_args(argv)
    env = os.environ if env is None else env
    now = now or datetime.now(timezone.utc)
    missing = [k for k in REQUIRED if not env.get(k)]
    if 'CSP_KUMA_PUSH_URL' in missing:
        print('csp-retention-check: CSP_KUMA_PUSH_URL is not set', file=sys.stderr)
        return 2
    if missing:
        status, reason = 'down', 'config'
    elif args.fixture:
        status, reason = decide(*fixture(args.fixture, now), now)
        reason = f'fixture {args.fixture}: {reason}'
    else:
        http_status, payload = query_d1(env, opener)
        status, reason = ('down', 'network') if http_status is None else decide(http_status, payload, now)
    print(f'csp-retention-check: {status} {reason}')
    if args.dry_run:
        return 0
    if not push(env['CSP_KUMA_PUSH_URL'], status, reason, opener):
        print('csp-retention-check: Kuma push failed', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

"""Tests for csp_retention_check (stdlib unittest; run: python3 -m unittest discover -s ops/csp-retention-check)."""
import io
import json
import unittest
import urllib.error
import urllib.parse
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timedelta, timezone

import csp_retention_check as c

NOW = datetime(2026, 11, 25, 6, 0, tzinfo=timezone.utc)
SECRET = 'tok-SECRET-123'
PUSH_SECRET = 'pushSECRET456'
ENV = {
    'CSP_D1_READ_TOKEN': SECRET, 'CSP_CF_ACCOUNT_ID': 'acct', 'CSP_PROD_D1_ID': 'db',
    'CSP_KUMA_PUSH_URL': f'http://127.0.0.1:3001/api/push/{PUSH_SECRET}?status=up&msg=OK&ping=',
}


def ok(row):
    return {'success': True, 'result': [{'results': [row] if row is not None else [], 'success': True}]}


def stamp(delta):
    return (NOW - delta).strftime('%Y-%m-%dT%H:%M:%S.000Z')


def row(age=timedelta(hours=2), **kw):
    r = {'last_ok_at': stamp(age), 'scheduled_at': stamp(age), 'keep_from': '2026-10-26'}
    r.update(kw)
    return r


class Resp:
    def __init__(self, status, body=b''):
        self.status, self._body = status, body

    def read(self, n=-1):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeNet:
    """Records every request; answers D1 with a canned outcome and Kuma with 200."""

    def __init__(self, d1=None, kuma_status=200):
        self.d1, self.kuma_status, self.calls = d1, kuma_status, []

    def __call__(self, req, timeout=None):
        url = req if isinstance(req, str) else req.full_url
        self.calls.append((url, req if not isinstance(req, str) else None, timeout))
        if url.startswith(c.API):
            if isinstance(self.d1, Exception):
                raise self.d1
            status, payload = self.d1
            body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
            if status != 200:
                raise urllib.error.HTTPError(url, status, 'x', {}, io.BytesIO(body))
            return Resp(200, body)
        if isinstance(self.kuma_status, Exception):
            raise self.kuma_status
        return Resp(self.kuma_status)

    def pushes(self):
        return [urllib.parse.parse_qs(urllib.parse.urlsplit(u).query) for u, _, _ in self.calls if '/api/push/' in u]


def run(net, argv=(), env=ENV):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = c.main(list(argv), env=dict(env), now=NOW, opener=net)
    return code, out.getvalue() + err.getvalue()


class Decide(unittest.TestCase):
    def test_fresh_is_up(self):
        s, r = c.decide(200, ok(row()), NOW)
        self.assertEqual(s, 'up')
        self.assertTrue(r.startswith('ok age 120m run '))

    def test_just_under_and_at_26h(self):
        self.assertEqual(c.decide(200, ok(row(timedelta(hours=25, minutes=59))), NOW)[0], 'up')
        self.assertEqual(c.decide(200, ok(row(timedelta(hours=26))), NOW), ('down', 'stale_26h'))

    def test_stale_27h(self):
        self.assertEqual(c.decide(200, ok(row(timedelta(hours=27))), NOW), ('down', 'stale_27h'))

    def test_future(self):
        self.assertEqual(c.decide(200, ok(row(-timedelta(minutes=10))), NOW), ('down', 'future'))
        self.assertEqual(c.decide(200, ok(row(-timedelta(minutes=4))), NOW)[0], 'up')

    def test_malformed_times_and_dates(self):
        for bad in ({'last_ok_at': 'yesterday'}, {'last_ok_at': '2026-11-25T05:00:00'},
                    {'last_ok_at': None}, {'scheduled_at': 'x'}, {'keep_from': '2026-13-01'},
                    {'keep_from': None}):
            with self.subTest(bad=bad):
                self.assertEqual(c.decide(200, ok(row(**bad)), NOW), ('down', 'malformed'))

    def test_missing_row_and_missing_table(self):
        self.assertEqual(c.decide(200, ok(None), NOW), ('down', 'missing'))
        no_table = {'success': False, 'errors': [{'code': 7500, 'message': 'no such table: retention_status: SQLITE_ERROR'}]}
        self.assertEqual(c.decide(400, no_table, NOW), ('down', 'missing'))

    def test_auth_http_and_api_errors(self):
        self.assertEqual(c.decide(401, {}, NOW), ('down', 'auth'))
        self.assertEqual(c.decide(403, None, NOW), ('down', 'auth'))
        self.assertEqual(c.decide(500, None, NOW), ('down', 'http_500'))
        self.assertEqual(c.decide(200, {'success': False}, NOW), ('down', 'api_error'))
        self.assertEqual(c.decide(200, None, NOW), ('down', 'api_error'))
        self.assertEqual(c.decide(200, {'success': True, 'result': []}, NOW), ('down', 'malformed'))
        self.assertEqual(c.decide(200, {'success': True, 'result': [{'results': 'x'}]}, NOW), ('down', 'malformed'))


class Main(unittest.TestCase):
    def assert_no_secret(self, net, text):
        for u, _, _ in net.calls:
            if '/api/push/' in u:
                q = urllib.parse.urlsplit(u).query
                self.assertNotIn(SECRET, q)
                self.assertNotIn(PUSH_SECRET, q)
        self.assertNotIn(SECRET, text)
        self.assertNotIn(PUSH_SECRET, text)

    def test_up_pushes_up_with_the_fixed_query_and_read_token(self):
        net = FakeNet(d1=(200, ok(row())))
        code, text = run(net)
        self.assertEqual(code, 0)
        d1_url, d1_req, d1_timeout = net.calls[0]
        self.assertEqual(d1_url, f'{c.API}/accounts/acct/d1/database/db/query')
        self.assertEqual(json.loads(d1_req.data), {'sql': c.SQL})
        self.assertEqual(d1_req.get_header('Authorization'), 'Bearer ' + SECRET)
        self.assertEqual(d1_timeout, c.D1_TIMEOUT)
        p = net.pushes()
        self.assertEqual(len(p), 1)
        self.assertEqual(p[0]['status'], ['up'])
        self.assertNotIn('OK', p[0]['msg'])  # the configured ?msg=OK is replaced
        self.assert_no_secret(net, text)

    def test_every_failure_pushes_down_with_a_reason_code(self):
        cases = {
            'stale_27h': (200, ok(row(timedelta(hours=27)))),
            'future': (200, ok(row(-timedelta(hours=1)))),
            'malformed': (200, ok(row(last_ok_at='nope'))),
            'missing': (200, ok(None)),
            'auth': (401, {'success': False, 'errors': [{'code': 10000, 'message': 'Authentication error'}]}),
            'http_500': (500, b'<html>oops</html>'),
            'api_error': (200, b'not json'),
        }
        for reason, d1 in cases.items():
            with self.subTest(reason=reason):
                net = FakeNet(d1=d1)
                code, text = run(net)
                self.assertEqual(code, 0)
                self.assertEqual(net.pushes()[0]['status'], ['down'])
                self.assertEqual(net.pushes()[0]['msg'], [reason])
                self.assert_no_secret(net, text)
                self.assertNotIn('oops', text)

    def test_network_error_pushes_down(self):
        net = FakeNet(d1=urllib.error.URLError('dns'))
        code, _ = run(net)
        self.assertEqual((code, net.pushes()[0]['msg']), (0, ['network']))
        net = FakeNet(d1=TimeoutError())
        run(net)
        self.assertEqual(net.pushes()[0]['msg'], ['network'])

    def test_missing_credential_pushes_down_without_calling_d1(self):
        env = dict(ENV)
        del env['CSP_D1_READ_TOKEN']
        net = FakeNet(d1=(200, ok(row())))
        code, _ = run(net, env=env)
        self.assertEqual(code, 0)
        self.assertFalse(any(u.startswith(c.API) for u, _, _ in net.calls))
        self.assertEqual(net.pushes()[0], {'status': ['down'], 'msg': ['config']})

    def test_missing_push_url_exits_2_without_network(self):
        env = dict(ENV)
        del env['CSP_KUMA_PUSH_URL']
        net = FakeNet(d1=(200, ok(row())))
        code, _ = run(net, env=env)
        self.assertEqual((code, net.calls), (2, []))

    def test_failed_push_exits_1(self):
        self.assertEqual(run(FakeNet(d1=(200, ok(row())), kuma_status=urllib.error.URLError('down')))[0], 1)
        self.assertEqual(run(FakeNet(d1=(200, ok(row())), kuma_status=500))[0], 1)

    def test_fixtures_skip_d1_and_push_their_decision(self):
        net = FakeNet(d1=AssertionError('D1 must not be called'))
        run(net, ['--fixture', 'stale'])
        self.assertEqual(net.pushes()[0]['status'], ['down'])
        self.assertEqual(net.pushes()[0]['msg'], ['fixture stale: stale_27h'])
        net = FakeNet(d1=AssertionError('D1 must not be called'))
        run(net, ['--fixture', 'fresh'])
        self.assertEqual(net.pushes()[0]['status'], ['up'])

    def test_dry_run_does_not_push(self):
        net = FakeNet(d1=(200, ok(row())))
        code, text = run(net, ['--dry-run'])
        self.assertEqual((code, net.pushes()), (0, []))
        self.assertIn('csp-retention-check: up ok age', text)

    def test_push_url_keeps_path_and_encodes_message(self):
        u = c.push_url(ENV['CSP_KUMA_PUSH_URL'], 'down', 'a b&c=d' + 'x' * 200)
        parts = urllib.parse.urlsplit(u)
        self.assertEqual(parts.path, f'/api/push/{PUSH_SECRET}')
        q = urllib.parse.parse_qs(parts.query, keep_blank_values=True)
        self.assertEqual(q['status'], ['down'])
        self.assertEqual(len(q['msg'][0]), 120)
        self.assertTrue(q['msg'][0].startswith('a b&c=d'))


if __name__ == '__main__':
    unittest.main()

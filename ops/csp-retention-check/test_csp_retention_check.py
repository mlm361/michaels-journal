"""Tests for csp_retention_check (stdlib unittest; run: python3 -m unittest discover -s ops/csp-retention-check).

All network is offline: canned responses through a fake opener, plus one loopback HTTP server for
the real no-redirect opener.
"""
import io
import json
import threading
import unittest
import urllib.error
import urllib.parse
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

import csp_retention_check as c

NOW = datetime(2026, 11, 25, 6, 0, tzinfo=timezone.utc)
SECRET = 'tok-SECRET-123'
PUSH_SECRET = 'pushSECRET456'
ENV = {
    'CSP_D1_READ_TOKEN': SECRET, 'CSP_CF_ACCOUNT_ID': 'acct', 'CSP_PROD_D1_ID': 'db',
    'CSP_KUMA_PUSH_URL': f'http://127.0.0.1:3001/api/push/{PUSH_SECRET}?status=up&msg=OK&ping=',
}


def iso(dt):
    return dt.strftime('%Y-%m-%dT%H:%M:%S.000Z')


def receipt(day=NOW.date(), done_after=timedelta(seconds=4), **kw):
    """A stamp exactly as workers/csp-retention writes it for the run scheduled on `day`."""
    scheduled = datetime(day.year, day.month, day.day, 3, 17, tzinfo=timezone.utc)
    r = {'last_ok_at': iso(scheduled + done_after), 'scheduled_at': iso(scheduled), 'cron': '17 3 * * *',
         'keep_from': (day - timedelta(days=30)).isoformat()}
    r.update(kw)
    return r


def d1(row, statement_success=True):
    """Real-shaped D1 /query success envelope (one statement)."""
    return {'result': [{'results': [row] if row is not None else [], 'success': statement_success,
                        'meta': {'served_by': 'v3-prod', 'duration': 0.2, 'changes': 0, 'rows_read': 1}}],
            'errors': [], 'messages': [], 'success': True}


# Sally R2 P2: parseable but extreme timestamps. The keep_from is whatever a buggy writer might send.
YEAR1 = {'last_ok_at': '0001-01-01T03:17:04.000Z', 'scheduled_at': '0001-01-01T03:17:00.000Z',
         'cron': '17 3 * * *', 'keep_from': '0001-01-01'}
YEAR9999 = {'last_ok_at': '9999-12-31T03:17:04.000Z', 'scheduled_at': '9999-12-31T03:17:00.000Z',
            'cron': '17 3 * * *', 'keep_from': '9999-12-01'}

D = NOW.date()
Y = D - timedelta(days=1)


class Resp:
    def __init__(self, status, body=b'', read_exc=None):
        self.status, self._body, self._read_exc = status, body, read_exc

    def read(self, n=-1):
        if self._read_exc:
            raise self._read_exc
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class TrackingHTTPError(urllib.error.HTTPError):
    def __init__(self, url, code, body=b'', read_exc=None):
        super().__init__(url, code, 'x', {}, io.BytesIO(body))
        self.reads, self._read_exc = 0, read_exc

    def read(self, n=-1):
        self.reads += 1
        if self._read_exc:
            raise self._read_exc
        return super().read(n)


class FakeNet:
    """Records every request; answers D1 with a canned outcome and Kuma with 200."""

    def __init__(self, d1_answer=None, kuma_status=200):
        self.d1_answer, self.kuma_status, self.calls, self.errors = d1_answer, kuma_status, [], []

    def __call__(self, req, timeout=None):
        url = req if isinstance(req, str) else req.full_url
        self.calls.append((url, req if not isinstance(req, str) else None, timeout))
        if url.startswith(c.API):
            a = self.d1_answer
            if isinstance(a, BaseException):
                raise a
            if callable(a):
                return a(url)
            status, payload = a
            body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
            if status != 200:
                err = TrackingHTTPError(url, status, body)
                self.errors.append(err)
                raise err
            return Resp(200, body)
        if isinstance(self.kuma_status, BaseException):
            raise self.kuma_status
        return Resp(self.kuma_status)

    def pushes(self):
        return [urllib.parse.parse_qs(urllib.parse.urlsplit(u).query) for u, _, _ in self.calls if '/api/push/' in u]


def run(net, argv=(), env=ENV, now=NOW):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = c.main(list(argv), env=dict(env), now=now, opener=net)
    return code, out.getvalue() + err.getvalue()


class Decide(unittest.TestCase):
    def test_real_shaped_success_is_up(self):
        s, r = c.decide(200, d1(receipt()), NOW)
        self.assertEqual(s, 'up')
        self.assertEqual(r, 'ok run 2026-11-25T03:17Z age 163m')

    def test_freshness_is_measured_from_the_scheduled_run(self):
        self.assertEqual(c.decide(200, d1(receipt(Y)), datetime(2026, 11, 25, 5, 16, tzinfo=timezone.utc))[0], 'up')
        self.assertEqual(c.decide(200, d1(receipt(Y)), datetime(2026, 11, 25, 5, 17, tzinfo=timezone.utc)), ('down', 'stale_26h'))
        self.assertEqual(c.decide(200, d1(receipt(D - timedelta(days=3))), NOW), ('down', 'stale_74h'))

    def test_old_receipt_with_a_fresh_completion_is_down(self):
        # An old run "completing" now must not mask the missed runs.
        late = receipt(D - timedelta(days=2), done_after=timedelta(days=2, hours=2))
        self.assertEqual(c.decide(200, d1(late), NOW), ('down', 'receipt'))
        self.assertEqual(c.decide(200, d1(receipt(done_after=timedelta(minutes=16))), NOW), ('down', 'receipt'))
        self.assertEqual(c.decide(200, d1(receipt(done_after=timedelta(minutes=15))), NOW)[0], 'up')

    def test_completion_before_the_scheduled_time_is_down(self):
        # Sally's reproduction: completed 2026-11-24 15:00 UTC claiming the 11-25 03:17 run.
        forged = receipt(D, last_ok_at='2026-11-24T15:00:00.000Z')
        self.assertEqual(c.decide(200, d1(forged), datetime(2026, 11, 24, 15, 5, tzinfo=timezone.utc)), ('down', 'receipt'))

    def test_future_receipt_is_down_with_five_minutes_tolerance(self):
        self.assertEqual(c.decide(200, d1(receipt(D + timedelta(days=1))), NOW), ('down', 'future'))
        early_clock = datetime(2026, 11, 25, 3, 14, tzinfo=timezone.utc)  # our clock 3 min behind
        self.assertEqual(c.decide(200, d1(receipt()), early_clock)[0], 'up')
        very_early = datetime(2026, 11, 25, 3, 11, tzinfo=timezone.utc)
        self.assertEqual(c.decide(200, d1(receipt()), very_early), ('down', 'future'))

    def test_scheduled_time_must_be_the_cron_instant(self):
        for bad in ('2026-11-25T03:16:59.999Z', '2026-11-25T03:32:00.000Z', '2026-11-25T04:17:00.000Z',
                    '2026-11-25T02:17:00.000Z', '2026-11-25T00:00:00.000Z'):
            with self.subTest(bad=bad):
                done = iso(datetime.strptime(bad, '%Y-%m-%dT%H:%M:%S.%fZ') + timedelta(seconds=4))
                r = receipt(scheduled_at=bad, last_ok_at=done)
                self.assertEqual(c.decide(200, d1(r), datetime(2026, 11, 25, 6, 0, tzinfo=timezone.utc)),
                                 ('down', 'receipt'))

    def test_cloudflare_dispatch_jitter_is_up(self):
        # 2026-11-25 prod, the first real run: scheduled_at 03:17:41.000Z, last_ok_at 03:17:43.464Z.
        real = receipt(scheduled_at='2026-11-25T03:17:41.000Z', last_ok_at='2026-11-25T03:17:43.464Z')
        self.assertEqual(c.decide(200, d1(real), datetime(2026, 11, 25, 3, 21, tzinfo=timezone.utc)),
                         ('up', 'ok run 2026-11-25T03:17Z age 3m'))
        for ok in ('2026-11-25T03:17:00.500Z', '2026-11-25T03:31:59.999Z'):
            with self.subTest(ok=ok):
                done = iso(datetime.strptime(ok, '%Y-%m-%dT%H:%M:%S.%fZ') + timedelta(seconds=4))
                r = receipt(scheduled_at=ok, last_ok_at=done)
                self.assertEqual(c.decide(200, d1(r), datetime(2026, 11, 25, 6, 0, tzinfo=timezone.utc))[0], 'up')

    def test_cron_and_keep_from_must_match(self):
        self.assertEqual(c.decide(200, d1(receipt(cron='manual')), NOW), ('down', 'cron'))
        self.assertEqual(c.decide(200, d1(receipt(cron=None)), NOW), ('down', 'cron'))
        self.assertEqual(c.decide(200, d1(receipt(keep_from='2026-10-25')), NOW), ('down', 'keep_from'))
        self.assertEqual(c.decide(200, d1(receipt(keep_from='2026-10-27')), NOW), ('down', 'keep_from'))
        self.assertEqual(c.decide(200, d1(receipt(keep_from=None)), NOW), ('down', 'keep_from'))

    def test_malformed_times(self):
        for bad in ({'last_ok_at': 'yesterday'}, {'last_ok_at': '2026-11-25T03:17:04'}, {'last_ok_at': None},
                    {'scheduled_at': 'x'}, {'scheduled_at': 17}):
            with self.subTest(bad=bad):
                self.assertEqual(c.decide(200, d1(receipt(**bad)), NOW), ('down', 'malformed'))

    def test_extreme_timestamps_are_down_without_overflow(self):
        self.assertEqual(c.decide(200, d1(YEAR1), NOW)[0], 'down')
        self.assertTrue(c.decide(200, d1(YEAR1), NOW)[1].startswith('stale_'))
        self.assertEqual(c.decide(200, d1(YEAR9999), NOW), ('down', 'future'))
        # even with the clock at the start of time, the cutoff overflow is DOWN malformed, not a crash
        early = datetime(1, 1, 1, 4, 0, tzinfo=timezone.utc)
        self.assertEqual(c.decide(200, d1(YEAR1), early), ('down', 'malformed'))

    def test_statement_level_failure_is_down(self):
        self.assertEqual(c.decide(200, d1(receipt(), statement_success=False), NOW), ('down', 'api_error'))
        p = d1(receipt())
        del p['result'][0]['success']
        self.assertEqual(c.decide(200, p, NOW), ('down', 'api_error'))

    def test_missing_row_and_missing_table(self):
        self.assertEqual(c.decide(200, d1(None), NOW), ('down', 'missing'))
        no_table = {'success': False, 'errors': [{'code': 7500, 'message': 'no such table: retention_status: SQLITE_ERROR'}]}
        self.assertEqual(c.decide(400, no_table, NOW), ('down', 'missing'))

    def test_auth_http_and_envelope_errors(self):
        self.assertEqual(c.decide(401, {}, NOW), ('down', 'auth'))
        self.assertEqual(c.decide(403, None, NOW), ('down', 'auth'))
        self.assertEqual(c.decide(500, None, NOW), ('down', 'http_500'))
        self.assertEqual(c.decide(302, None, NOW), ('down', 'http_302'))
        self.assertEqual(c.decide(200, {'success': False}, NOW), ('down', 'api_error'))
        self.assertEqual(c.decide(200, None, NOW), ('down', 'api_error'))
        self.assertEqual(c.decide(200, {'success': True, 'result': []}, NOW), ('down', 'malformed'))
        self.assertEqual(c.decide(200, {'success': True, 'result': [{'success': True, 'results': 'x'}]}, NOW), ('down', 'malformed'))


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
        net = FakeNet((200, d1(receipt())))
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
        self.assertTrue(p[0]['msg'][0].startswith('ok run 2026-11-25T03:17Z'))
        self.assert_no_secret(net, text)

    def test_every_failure_pushes_down_with_a_reason_code(self):
        cases = {
            'stale_74h': (200, d1(receipt(D - timedelta(days=3)))),
            'future': (200, d1(receipt(D + timedelta(days=1)))),
            'receipt': (200, d1(receipt(done_after=timedelta(hours=2)))),
            'cron': (200, d1(receipt(cron='* * * * *'))),
            'keep_from': (200, d1(receipt(keep_from='2026-01-01'))),
            'malformed': (200, d1(receipt(last_ok_at='nope'))),
            'missing': (200, d1(None)),
            'auth': (401, {'success': False, 'errors': [{'code': 10000, 'message': 'Authentication error'}]}),
            'http_500': (500, b'<html>oops</html>'),
            'api_error': (200, b'not json'),
        }
        for reason, answer in cases.items():
            with self.subTest(reason=reason):
                net = FakeNet(answer)
                code, text = run(net)
                self.assertEqual(code, 0)
                self.assertEqual(net.pushes()[0]['status'], ['down'])
                self.assertEqual(net.pushes()[0]['msg'], [reason])
                self.assert_no_secret(net, text)
                self.assertNotIn('oops', text)

    def test_year_one_receipt_pushes_down_end_to_end_and_a_normal_receipt_still_pushes_up(self):
        net = FakeNet((200, d1(YEAR1)))
        code, text = run(net)
        self.assertEqual(code, 0)
        self.assertEqual(len(net.pushes()), 1)
        self.assertEqual(net.pushes()[0]['status'], ['down'])
        self.assertTrue(net.pushes()[0]['msg'][0].startswith('stale_'))
        self.assert_no_secret(net, text)
        net = FakeNet((200, d1(receipt())))
        code, _ = run(net)
        self.assertEqual(code, 0)
        self.assertEqual(net.pushes()[0]['status'], ['up'])
        self.assertEqual(net.pushes()[0]['msg'], ['ok run 2026-11-25T03:17Z age 163m'])

    def test_an_unforeseen_error_while_deciding_still_pushes_down(self):
        orig = c.decide

        def boom(*a):
            raise OverflowError('date value out of range')
        c.decide = boom
        try:
            net = FakeNet((200, d1(receipt())))
            code, text = run(net)
        finally:
            c.decide = orig
        self.assertEqual(code, 0)
        self.assertEqual(net.pushes()[0]['status'], ['down'])
        self.assertEqual(net.pushes()[0]['msg'], ['internal'])
        self.assertNotIn('out of range', text)

    def test_auth_errors_never_read_the_body_and_still_push_down(self):
        for code_ in (401, 403):
            with self.subTest(code=code_):
                err = TrackingHTTPError(c.API, code_, read_exc=TimeoutError('slow body'))
                net = FakeNet(err)
                code, _ = run(net)
                self.assertEqual(code, 0)
                self.assertEqual(err.reads, 0)
                self.assertEqual(net.pushes()[0], {'status': ['down'], 'msg': ['auth'], })

    def test_other_error_body_read_failure_still_pushes_down(self):
        err = TrackingHTTPError(c.API, 500, read_exc=TimeoutError('slow body'))
        net = FakeNet(err)
        code, _ = run(net)
        self.assertEqual((code, err.reads), (0, 1))
        self.assertEqual(net.pushes()[0]['msg'], ['http_500'])

    def test_success_body_read_failure_pushes_network_down(self):
        net = FakeNet(lambda url: Resp(200, read_exc=TimeoutError('slow body')))
        code, _ = run(net)
        self.assertEqual((code, net.pushes()[0]['msg']), (0, ['network']))

    def test_network_error_pushes_down(self):
        for exc in (urllib.error.URLError('dns'), TimeoutError(), ConnectionResetError()):
            with self.subTest(exc=type(exc).__name__):
                net = FakeNet(exc)
                code, _ = run(net)
                self.assertEqual((code, net.pushes()[0]['msg']), (0, ['network']))

    def test_missing_credential_pushes_down_without_calling_d1(self):
        env = dict(ENV)
        del env['CSP_D1_READ_TOKEN']
        net = FakeNet((200, d1(receipt())))
        code, _ = run(net, env=env)
        self.assertEqual(code, 0)
        self.assertFalse(any(u.startswith(c.API) for u, _, _ in net.calls))
        self.assertEqual(net.pushes()[0], {'status': ['down'], 'msg': ['config']})

    def test_push_destination_must_be_loopback_kuma(self):
        bad = ['', 'https://127.0.0.1:3001/api/push/abc', 'http://localhost:3001/api/push/abc',
               'http://127.0.0.1:3002/api/push/abc', 'http://192.168.1.21:3001/api/push/abc',
               'http://127.0.0.1/api/push/abc', 'http://127.0.0.1:3001/api/push/', 'http://127.0.0.1:3001/api/push/a/b',
               'http://u:p@127.0.0.1:3001/api/push/abc', 'http://127.0.0.1:3001/push/abc',
               'http://127.0.0.1:99999/api/push/abc']
        for url in bad:
            with self.subTest(url=url):
                env = dict(ENV, CSP_KUMA_PUSH_URL=url)
                if not url:
                    del env['CSP_KUMA_PUSH_URL']
                net = FakeNet((200, d1(receipt())))
                code, _ = run(net, env=env)
                self.assertEqual((code, net.calls), (2, []))
        self.assertTrue(c.kuma_url_ok(ENV['CSP_KUMA_PUSH_URL']))

    def test_failed_push_exits_1(self):
        self.assertEqual(run(FakeNet((200, d1(receipt())), kuma_status=urllib.error.URLError('down')))[0], 1)
        self.assertEqual(run(FakeNet((200, d1(receipt())), kuma_status=500))[0], 1)

    def test_stale_fixture_skips_d1_and_pushes_down(self):
        net = FakeNet(AssertionError('D1 must not be called'))
        run(net, ['--fixture', 'stale'])
        self.assertEqual(net.pushes()[0]['status'], ['down'])
        self.assertRegex(net.pushes()[0]['msg'][0], r'^fixture stale: stale_2[67]h$')
        for hour in range(24):  # the canned receipt is well-formed and stale at any hour
            now = datetime(2026, 11, 25, hour, 30, tzinfo=timezone.utc)
            self.assertRegex(c.decide(*c.fixture('stale', now), now)[1], r'^stale_')

    def test_there_is_no_fresh_fixture(self):
        with self.assertRaises(SystemExit), redirect_stderr(io.StringIO()):
            c.main(['--fixture', 'fresh'], env=dict(ENV), now=NOW, opener=FakeNet())

    def test_dry_run_does_not_push(self):
        net = FakeNet((200, d1(receipt())))
        code, text = run(net, ['--dry-run'])
        self.assertEqual((code, net.pushes()), (0, []))
        self.assertIn('csp-retention-check: up ok run', text)

    def test_push_url_keeps_path_and_encodes_message(self):
        u = c.push_url(ENV['CSP_KUMA_PUSH_URL'], 'down', 'a b&c=d' + 'x' * 200)
        parts = urllib.parse.urlsplit(u)
        self.assertEqual(parts.path, f'/api/push/{PUSH_SECRET}')
        q = urllib.parse.parse_qs(parts.query, keep_blank_values=True)
        self.assertEqual(q['status'], ['down'])
        self.assertEqual(len(q['msg'][0]), 120)
        self.assertTrue(q['msg'][0].startswith('a b&c=d'))


class _Server(BaseHTTPRequestHandler):
    hits = []

    def log_message(self, *a):
        pass

    def _go(self):
        _Server.hits.append((self.command, self.path, self.headers.get('Authorization')))
        if self.path.startswith('/redir'):
            self.send_response(302)
            self.send_header('Location', '/capture')
            self.end_headers()
        else:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{}')

    do_GET = do_POST = _go


class RealOpenerRefusesRedirects(unittest.TestCase):
    def setUp(self):
        _Server.hits = []
        self.srv = HTTPServer(('127.0.0.1', 0), _Server)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = f'http://127.0.0.1:{self.srv.server_port}'

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()

    def test_d1_query_does_not_follow_a_redirect_with_the_token(self):
        orig = c.API
        c.API = self.base + '/redir'
        try:
            status, payload = c.query_d1(ENV)  # the module's real opener
        finally:
            c.API = orig
        self.assertEqual((status, payload), (302, None))
        self.assertEqual([h[1] for h in _Server.hits], ['/redir/accounts/acct/d1/database/db/query'])
        self.assertEqual(c.decide(status, payload, NOW), ('down', 'http_302'))

    def test_push_does_not_follow_a_redirect(self):
        self.assertFalse(c.push(self.base + '/redir', 'up', 'x'))
        self.assertEqual(len(_Server.hits), 1)


if __name__ == '__main__':
    unittest.main()

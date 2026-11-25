-- JOURNAL-CSP-01 Phase 2 close-out: last successful retention run, written by workers/csp-retention.
-- Apply to csp-reports-PROD only, BEFORE deploying the Worker that writes it. Additive and idempotent.
-- The CHECKs make the stored receipt self-validating: real UTC instants in the Worker's exact
-- toISOString() form (a strftime round trip rejects impossible dates), completion not before the
-- scheduled time, keep_from = scheduled UTC day - 30 days (workers/csp-retention RETENTION_DAYS),
-- and non-negative INTEGER counts. A stamp that breaks any of them rolls back its whole batch.
CREATE TABLE IF NOT EXISTS retention_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_ok_at TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', last_ok_at) IS last_ok_at),
  scheduled_at TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', scheduled_at) IS scheduled_at),
  cron TEXT NOT NULL CHECK (typeof(cron) = 'text' AND length(cron) BETWEEN 1 AND 64),
  keep_from TEXT NOT NULL CHECK (keep_from IS date(scheduled_at, '-30 days')),
  preview_rows INTEGER NOT NULL CHECK (typeof(preview_rows) = 'integer' AND preview_rows >= 0),
  prod_rows INTEGER NOT NULL CHECK (typeof(prod_rows) = 'integer' AND prod_rows >= 0),
  preview_deleted INTEGER NOT NULL CHECK (typeof(preview_deleted) = 'integer' AND preview_deleted >= 0),
  prod_deleted INTEGER NOT NULL CHECK (typeof(prod_deleted) = 'integer' AND prod_deleted >= 0),
  CHECK (last_ok_at >= scheduled_at)
);

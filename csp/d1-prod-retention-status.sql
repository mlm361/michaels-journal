-- JOURNAL-CSP-01 Phase 2 close-out: last successful retention run, written by workers/csp-retention.
-- Apply to csp-reports-PROD only, BEFORE deploying the Worker that writes it. Additive and idempotent.
CREATE TABLE IF NOT EXISTS retention_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_ok_at TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  cron TEXT NOT NULL,
  keep_from TEXT NOT NULL,
  preview_rows INTEGER NOT NULL,
  prod_rows INTEGER NOT NULL,
  preview_deleted INTEGER NOT NULL,
  prod_deleted INTEGER NOT NULL
);

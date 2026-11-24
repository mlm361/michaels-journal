-- JOURNAL-CSP-01 Phase 2b: D1 schema for csp-reports-preview and csp-reports-prod (plan v3 D5).
-- Created by Sally in the D1 console on 2026-11-23. Tests (tests/csp-report.test.mjs) use this file.
CREATE TABLE agg (
  day TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  disposition TEXT NOT NULL,
  directive TEXT NOT NULL,
  blocked TEXT NOT NULL,
  page_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, policy_id, disposition, directive, blocked, page_id, item_id)
);

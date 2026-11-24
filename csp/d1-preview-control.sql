-- JOURNAL-CSP-01 Phase 2b (Sally 2b r1 finding 2): the preview write switch. PREVIEW database only
-- (csp-reports-preview). A preview deployment may write only while this row names its own host, so
-- retiring a preview is one UPDATE here, independent of what any build baked into its metadata.
-- No row, or an empty value, means no preview writes at all (the state after testing ends).
CREATE TABLE IF NOT EXISTS control (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Set the active preview (one statement, replaces the previous one):
--   INSERT INTO control (name, value) VALUES ('active_preview_host', '<hash>.michaels-journal.pages.dev')
--     ON CONFLICT (name) DO UPDATE SET value = excluded.value;
-- Turn preview writes off:
--   DELETE FROM control WHERE name = 'active_preview_host';

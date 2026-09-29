-- Rollback of db/migration/V20260929000025__add_project_finance.sql, for returning to an artifact without the
-- finance module. It destroys every finance entry, version and setting: take a backup first. Run it on the migration
-- role (the owner of the tables) in one transaction, with the API and worker stopped, then start the previous
-- artifact. Flyway never reads this directory; the file ships with the artifact so the step is always at hand.
BEGIN;
DROP TABLE app.finance_entry_version;
DROP TABLE app.finance_entry;
DROP TABLE app.finance_settings;
DROP FUNCTION app.record_finance_entry_version();
DROP FUNCTION app.guard_finance_entry();
DROP FUNCTION auth.can_manage_finance(text);
DROP FUNCTION auth.can_read_finance(text);
-- Finance events and retry receipts would outlive the module: the previous artifact shows every non-agent topic to
-- agents, and receipts name entries and settings. Row security hides them from the owner without an actor, so it
-- is lifted for this transaction only, as migration 016 did for its backfill.
ALTER TABLE app.outbox NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.idempotency NO FORCE ROW LEVEL SECURITY;
DELETE FROM app.outbox WHERE topic LIKE 'finance-%';
DELETE FROM app.audit_events WHERE action LIKE 'finance-%';
DELETE FROM app.idempotency WHERE operation LIKE 'finance-%';
ALTER TABLE app.outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE app.idempotency FORCE ROW LEVEL SECURITY;
DELETE FROM public.flyway_schema_history WHERE version = '20260929000025';
COMMIT;

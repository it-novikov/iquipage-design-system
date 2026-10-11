-- Rollback of db/migration/V20261001000072–076 (finance categories, plans, variance notes, set-based finance
-- read policies and discarded drafts), for returning to an
-- artifact without the budget plan. It destroys every category, plan, version, line and explanation; entries keep
-- their category name as the text they had before 072 and lose their release. Take a backup first. Run it on the
-- migration role (the owner of the tables) in one transaction, with the API and worker stopped, then start the
-- compatible artifact. Later unrelated migrations (including agent work 077) stay applied: use an artifact
-- that includes their exact ledger, or restore the full pre-release database backup for a full-image rollback.
-- Flyway never reads this directory; the file ships with the artifact so the step is always at
-- hand. Tasks created for explanations stay: they are ordinary tasks.
BEGIN;
-- The ledger's read policies of V20260929000025 come back first; then nothing needs auth.projects_with.
DROP POLICY finance_settings_read ON app.finance_settings;
CREATE POLICY finance_settings_read ON app.finance_settings FOR SELECT USING(auth.can_read_finance(project_id));
DROP POLICY finance_entry_read ON app.finance_entry;
CREATE POLICY finance_entry_read ON app.finance_entry FOR SELECT USING(auth.can_read_finance(project_id));
DROP POLICY finance_entry_version_read ON app.finance_entry_version;
CREATE POLICY finance_entry_version_read ON app.finance_entry_version FOR SELECT USING(auth.can_read_finance(project_id));
DROP TABLE app.finance_variance_note;
DROP FUNCTION app.guard_finance_variance_note();
DROP TABLE app.finance_plan_line;
DROP TABLE app.finance_plan_version;
DROP TABLE app.finance_plan;
DROP FUNCTION app.guard_finance_plan_line();
DROP FUNCTION app.guard_finance_plan_version();
DROP FUNCTION app.guard_finance_plan();

-- The ledger rules of V20260929000025, without the category and the release.
CREATE OR REPLACE FUNCTION app.guard_finance_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.revision<>1 OR NEW.state NOT IN ('planned','posted') THEN
      RAISE EXCEPTION 'A finance entry starts at revision 1 as planned or posted' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state='voided' THEN
    RAISE EXCEPTION 'A voided finance entry cannot change' USING ERRCODE='check_violation';
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'A finance entry change adds exactly one revision' USING ERRCODE='check_violation';
  END IF;
  IF NEW.project_id<>OLD.project_id OR NEW.id<>OLD.id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'The identity and creation of a finance entry are fixed' USING ERRCODE='check_violation';
  END IF;
  IF OLD.state='posted' AND NEW.state='planned' THEN
    RAISE EXCEPTION 'A posted finance entry cannot return to planned' USING ERRCODE='check_violation';
  END IF;
  IF NEW.state='voided' AND (NEW.direction,NEW.amount_minor,NEW.currency_code,NEW.due_date,NEW.posted_date,NEW.category,
      NEW.description,NEW.counterparty,NEW.reference) IS DISTINCT FROM (OLD.direction,OLD.amount_minor,OLD.currency_code,
      OLD.due_date,OLD.posted_date,OLD.category,OLD.description,OLD.counterparty,OLD.reference) THEN
    RAISE EXCEPTION 'Voiding a finance entry changes only its state and reason' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION app.record_finance_entry_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO app.finance_entry_version(project_id,entry_id,revision,change,direction,state,amount_minor,currency_code,
    due_date,posted_date,category,description,counterparty,reference,void_reason,actor_id,created_at)
  VALUES (NEW.project_id,NEW.id,NEW.revision,
    CASE WHEN TG_OP='INSERT' THEN 'created'
         WHEN NEW.state='voided' THEN 'voided'
         WHEN OLD.state='planned' AND NEW.state='posted' THEN 'posted'
         ELSE 'updated' END,
    NEW.direction,NEW.state,NEW.amount_minor,NEW.currency_code,NEW.due_date,NEW.posted_date,NEW.category,
    NEW.description,NEW.counterparty,NEW.reference,NEW.void_reason,NEW.updated_by,NEW.updated_at);
  RETURN NULL;
END $$;
ALTER TABLE app.finance_entry DROP COLUMN category_id, DROP COLUMN release_id;
ALTER TABLE app.finance_entry_version DROP COLUMN category_id, DROP COLUMN release_id;
DROP TABLE app.finance_category;
DROP FUNCTION app.finance_category_key(text);
DROP FUNCTION auth.projects_with(text);

-- Events and retry receipts of the plan would outlive it. Row security hides them from the owner without an actor,
-- so it is lifted for this transaction only, as the rollback of V20260929000025 does.
ALTER TABLE app.outbox NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.idempotency NO FORCE ROW LEVEL SECURITY;
DELETE FROM app.outbox WHERE topic LIKE 'finance-plan.%' OR topic LIKE 'finance-category.%' OR topic LIKE 'finance-variance.%';
DELETE FROM app.audit_events WHERE action LIKE 'finance-plan.%' OR action LIKE 'finance-category.%' OR action LIKE 'finance-variance.%';
DELETE FROM app.idempotency WHERE operation LIKE 'finance-plan.%' OR operation LIKE 'finance-category.%'
  OR operation LIKE 'finance-variance.%';
ALTER TABLE app.outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE app.idempotency FORCE ROW LEVEL SECURITY;
DELETE FROM public.flyway_schema_history
  WHERE version IN ('20261001000072','20261001000073','20261001000074','20261001000075',
    '20261001000076');
COMMIT;

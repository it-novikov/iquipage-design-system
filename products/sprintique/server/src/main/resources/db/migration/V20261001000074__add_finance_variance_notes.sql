-- The explanation of a variance (docs/decisions/0009-finance-plan.md): a sentence or two by a person with
-- finance.write about one category, direction and currency of one plan version, with the forecast it was written
-- for, so a later forecast shows that the explanation is about another figure. It may name the task that acts on it.

CREATE TABLE app.finance_variance_note (
  project_id text NOT NULL,
  id text NOT NULL,
  plan_id text NOT NULL,
  version integer NOT NULL,
  category_id text NOT NULL,
  direction text NOT NULL,
  currency_code text NOT NULL,
  text text NOT NULL,
  task_id text,
  -- A sum of up to 100 000 entries of 10^15 − 1 exceeds bigint: numeric, as every total of the ledger.
  forecast_minor_at_note numeric(30,0) NOT NULL,
  revision integer NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pk_finance_variance_note PRIMARY KEY(project_id,id),
  CONSTRAINT fk_finance_variance_note__finance_plan_version FOREIGN KEY(project_id,plan_id,version)
    REFERENCES app.finance_plan_version(project_id,plan_id,version),
  CONSTRAINT fk_finance_variance_note__finance_category FOREIGN KEY(project_id,category_id)
    REFERENCES app.finance_category(project_id,id),
  CONSTRAINT fk_finance_variance_note__tasks FOREIGN KEY(project_id,task_id) REFERENCES app.tasks(project_id,id),
  CONSTRAINT fk_finance_variance_note__created_by FOREIGN KEY(created_by) REFERENCES auth.principals,
  CONSTRAINT fk_finance_variance_note__updated_by FOREIGN KEY(updated_by) REFERENCES auth.principals,
  CONSTRAINT ck_finance_variance_note__id CHECK(id ~ '^[A-Za-z0-9_-]{1,100}$'),
  CONSTRAINT ck_finance_variance_note__direction CHECK(direction IN ('income','expense')),
  CONSTRAINT ck_finance_variance_note__currency_code CHECK(currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_finance_variance_note__text CHECK(length(text) BETWEEN 1 AND 500),
  CONSTRAINT ck_finance_variance_note__revision CHECK(revision>0)
);
-- One explanation per variance of a version.
CREATE UNIQUE INDEX ux_finance_variance_note__variance
  ON app.finance_variance_note(project_id,plan_id,version,category_id,direction,currency_code);

-- What a note explains is fixed; each change adds one revision; a task, once named, stays the one task of the note.
CREATE FUNCTION app.guard_finance_variance_note() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.revision<>1 THEN
      RAISE EXCEPTION 'A finance variance note starts at revision 1' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'A finance variance note change adds exactly one revision' USING ERRCODE='check_violation';
  END IF;
  IF (NEW.project_id,NEW.id,NEW.plan_id,NEW.version,NEW.category_id,NEW.direction,NEW.currency_code,NEW.created_by,
      NEW.created_at) IS DISTINCT FROM (OLD.project_id,OLD.id,OLD.plan_id,OLD.version,OLD.category_id,OLD.direction,
      OLD.currency_code,OLD.created_by,OLD.created_at) THEN
    RAISE EXCEPTION 'What a finance variance note explains is fixed' USING ERRCODE='check_violation';
  END IF;
  IF OLD.task_id IS NOT NULL AND NEW.task_id IS DISTINCT FROM OLD.task_id THEN
    RAISE EXCEPTION 'The task of a finance variance note is fixed' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finance_variance_note_guard BEFORE INSERT OR UPDATE ON app.finance_variance_note
  FOR EACH ROW EXECUTE FUNCTION app.guard_finance_variance_note();

ALTER TABLE app.finance_variance_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.finance_variance_note FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_variance_note_read ON app.finance_variance_note FOR SELECT USING(auth.can(project_id,'finance.read'));
CREATE POLICY finance_variance_note_insert ON app.finance_variance_note FOR INSERT
  WITH CHECK(auth.can(project_id,'finance.write'));
CREATE POLICY finance_variance_note_update ON app.finance_variance_note FOR UPDATE
  USING(auth.can(project_id,'finance.write')) WITH CHECK(auth.can(project_id,'finance.write'));

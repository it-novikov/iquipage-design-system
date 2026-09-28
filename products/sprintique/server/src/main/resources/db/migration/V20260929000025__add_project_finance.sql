-- Project finance: a ledger of the project's income and expense entries, their immutable history and the
-- project's default currency. Amounts are integer minor units of an ISO 4217 currency; there are no accounts,
-- transfers or exchange rates. Totals are computed on read, never stored.

-- Finance is sensitive: people who are members of the project read it, project administrators change it. Agents
-- and workspace administrators who are not members never see it. The application checks the same rules first and
-- answers with the precise error; these functions are the database's own boundary.
CREATE FUNCTION auth.can_read_finance(target text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT auth.can_project(target) AND EXISTS(
    SELECT 1 FROM auth.principals p WHERE p.id=auth.actor_id() AND p.kind='human' AND p.disabled_at IS NULL)
$$;
CREATE FUNCTION auth.can_manage_finance(target text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT auth.can_read_finance(target) AND EXISTS(
    SELECT 1 FROM app.project_members m WHERE m.project_id=target AND m.principal_id=auth.actor_id() AND m.role='admin')
$$;
REVOKE ALL ON FUNCTION auth.can_read_finance(text),auth.can_manage_finance(text) FROM PUBLIC;

-- The project's finance settings. A project without a row uses RUB at revision 0.
CREATE TABLE app.finance_settings (
  project_id text NOT NULL,
  currency_code text NOT NULL DEFAULT 'RUB',
  revision integer NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pk_finance_settings PRIMARY KEY(project_id),
  CONSTRAINT fk_finance_settings__projects FOREIGN KEY(project_id) REFERENCES app.projects,
  CONSTRAINT fk_finance_settings__principals FOREIGN KEY(updated_by) REFERENCES auth.principals,
  CONSTRAINT ck_finance_settings__currency_code CHECK(currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_finance_settings__revision CHECK(revision>0)
);

-- One entry of the ledger. `planned` expects money on `due_date`; `posted` happened on `posted_date` (a planned
-- entry keeps its due date once posted); `voided` is final and keeps the dates it had. `entry_date` is the date the
-- entry counts on: the posting date, else the due date.
CREATE TABLE app.finance_entry (
  project_id text NOT NULL,
  id text NOT NULL,
  direction text NOT NULL,
  state text NOT NULL,
  amount_minor bigint NOT NULL,
  currency_code text NOT NULL,
  due_date date,
  posted_date date,
  entry_date date GENERATED ALWAYS AS (coalesce(posted_date,due_date)) STORED,
  category text NOT NULL,
  description text NOT NULL,
  counterparty text,
  reference text,
  void_reason text,
  revision integer NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pk_finance_entry PRIMARY KEY(project_id,id),
  CONSTRAINT fk_finance_entry__projects FOREIGN KEY(project_id) REFERENCES app.projects,
  CONSTRAINT fk_finance_entry__created_by FOREIGN KEY(created_by) REFERENCES auth.principals,
  CONSTRAINT fk_finance_entry__updated_by FOREIGN KEY(updated_by) REFERENCES auth.principals,
  CONSTRAINT ck_finance_entry__id CHECK(id ~ '^[A-Za-z0-9_-]{1,100}$'),
  CONSTRAINT ck_finance_entry__direction CHECK(direction IN ('income','expense')),
  CONSTRAINT ck_finance_entry__state CHECK(state IN ('planned','posted','voided')),
  CONSTRAINT ck_finance_entry__amount_minor CHECK(amount_minor BETWEEN 1 AND 999999999999999),
  CONSTRAINT ck_finance_entry__currency_code CHECK(currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_finance_entry__category CHECK(length(category) BETWEEN 1 AND 80),
  CONSTRAINT ck_finance_entry__description CHECK(length(description) BETWEEN 1 AND 500),
  CONSTRAINT ck_finance_entry__counterparty CHECK(counterparty IS NULL OR length(counterparty) BETWEEN 1 AND 160),
  CONSTRAINT ck_finance_entry__reference CHECK(reference IS NULL OR length(reference) BETWEEN 1 AND 160),
  CONSTRAINT ck_finance_entry__void_reason CHECK((state='voided')=(void_reason IS NOT NULL) AND (void_reason IS NULL OR length(void_reason) BETWEEN 1 AND 300)),
  CONSTRAINT ck_finance_entry__planned CHECK(state<>'planned' OR (due_date IS NOT NULL AND posted_date IS NULL)),
  CONSTRAINT ck_finance_entry__posted CHECK(state<>'posted' OR posted_date IS NOT NULL),
  CONSTRAINT ck_finance_entry__dated CHECK(due_date IS NOT NULL OR posted_date IS NOT NULL),
  CONSTRAINT ck_finance_entry__revision CHECK(revision>0)
);
CREATE INDEX ix_finance_entry__entry_date ON app.finance_entry(project_id,entry_date DESC,id DESC);

-- Every revision of an entry exactly as it was stored. Rows are written by the trigger below, never by hand, and
-- are never changed: the runtime role has no UPDATE or DELETE on this table.
CREATE TABLE app.finance_entry_version (
  project_id text NOT NULL,
  entry_id text NOT NULL,
  revision integer NOT NULL,
  change text NOT NULL,
  direction text NOT NULL,
  state text NOT NULL,
  amount_minor bigint NOT NULL,
  currency_code text NOT NULL,
  due_date date,
  posted_date date,
  category text NOT NULL,
  description text NOT NULL,
  counterparty text,
  reference text,
  void_reason text,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT pk_finance_entry_version PRIMARY KEY(project_id,entry_id,revision),
  CONSTRAINT fk_finance_entry_version__finance_entry FOREIGN KEY(project_id,entry_id) REFERENCES app.finance_entry(project_id,id),
  CONSTRAINT fk_finance_entry_version__principals FOREIGN KEY(actor_id) REFERENCES auth.principals,
  CONSTRAINT ck_finance_entry_version__change CHECK(change IN ('created','updated','posted','voided')),
  CONSTRAINT ck_finance_entry_version__revision CHECK(revision>0)
);

-- The rules no writer may skip, the application and a data import alike: an entry starts at revision 1 as planned
-- or posted; each change adds exactly one revision; a posted entry never returns to planned; voiding changes nothing
-- but the state and its reason; a voided entry never changes again; identity and creation are fixed.
CREATE FUNCTION app.guard_finance_entry() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER finance_entry_guard BEFORE INSERT OR UPDATE ON app.finance_entry
  FOR EACH ROW EXECUTE FUNCTION app.guard_finance_entry();

-- The version of each stored revision: its author and time are the row's own `updated_by` and `updated_at`.
CREATE FUNCTION app.record_finance_entry_version() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER finance_entry_version AFTER INSERT OR UPDATE ON app.finance_entry
  FOR EACH ROW EXECUTE FUNCTION app.record_finance_entry_version();

ALTER TABLE app.finance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.finance_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_settings_read ON app.finance_settings FOR SELECT USING(auth.can_read_finance(project_id));
CREATE POLICY finance_settings_insert ON app.finance_settings FOR INSERT WITH CHECK(auth.can_manage_finance(project_id));
CREATE POLICY finance_settings_update ON app.finance_settings FOR UPDATE
  USING(auth.can_manage_finance(project_id)) WITH CHECK(auth.can_manage_finance(project_id));
ALTER TABLE app.finance_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.finance_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_entry_read ON app.finance_entry FOR SELECT USING(auth.can_read_finance(project_id));
CREATE POLICY finance_entry_insert ON app.finance_entry FOR INSERT WITH CHECK(auth.can_manage_finance(project_id));
CREATE POLICY finance_entry_update ON app.finance_entry FOR UPDATE
  USING(auth.can_manage_finance(project_id)) WITH CHECK(auth.can_manage_finance(project_id));
ALTER TABLE app.finance_entry_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.finance_entry_version FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_entry_version_read ON app.finance_entry_version FOR SELECT USING(auth.can_read_finance(project_id));
CREATE POLICY finance_entry_version_insert ON app.finance_entry_version FOR INSERT WITH CHECK(auth.can_manage_finance(project_id));

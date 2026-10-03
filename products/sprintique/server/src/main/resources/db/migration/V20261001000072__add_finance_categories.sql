-- Finance categories and the release of an entry (docs/decisions/0009-finance-plan.md). A category is a named entry
-- of the project's own list, compared to the plan by its id; the text an entry carried before stays on it as a
-- historical label. An entry may name a release or sprint of the same project; the composite key keeps it there.

-- The key two names collide on: case, the letter ё and runs of spaces do not tell categories apart. lower() follows
-- the database locale, which may be C, so Cyrillic capitals are folded explicitly.
CREATE FUNCTION app.finance_category_key(name text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT translate(lower(regexp_replace(btrim(name),'\s+',' ','g')),
    'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯё','абвгдеежзийклмнопрстуфхцчшщъыьэюяе')
$$;

CREATE TABLE app.finance_category (
  project_id text NOT NULL,
  id text NOT NULL,
  name text NOT NULL,
  name_key text GENERATED ALWAYS AS (app.finance_category_key(name)) STORED,
  direction text NOT NULL,
  archived_at timestamptz,
  revision integer NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pk_finance_category PRIMARY KEY(project_id,id),
  CONSTRAINT fk_finance_category__projects FOREIGN KEY(project_id) REFERENCES app.projects,
  CONSTRAINT fk_finance_category__created_by FOREIGN KEY(created_by) REFERENCES auth.principals,
  CONSTRAINT fk_finance_category__updated_by FOREIGN KEY(updated_by) REFERENCES auth.principals,
  CONSTRAINT ck_finance_category__id CHECK(id ~ '^[A-Za-z0-9_-]{1,100}$'),
  CONSTRAINT ck_finance_category__name CHECK(length(name) BETWEEN 1 AND 80 AND name=btrim(name)),
  CONSTRAINT ck_finance_category__direction CHECK(direction IN ('income','expense','both')),
  CONSTRAINT ck_finance_category__revision CHECK(revision>0)
);
CREATE UNIQUE INDEX ux_finance_category__name_key ON app.finance_category(project_id,name_key);

-- Identity and creation are fixed; each change adds exactly one revision.
CREATE FUNCTION app.guard_finance_category() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.revision<>1 THEN
      RAISE EXCEPTION 'A finance category starts at revision 1' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'A finance category change adds exactly one revision' USING ERRCODE='check_violation';
  END IF;
  IF NEW.project_id<>OLD.project_id OR NEW.id<>OLD.id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'The identity and creation of a finance category are fixed' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finance_category_guard BEFORE INSERT OR UPDATE ON app.finance_category
  FOR EACH ROW EXECUTE FUNCTION app.guard_finance_category();

ALTER TABLE app.finance_entry ADD COLUMN category_id text, ADD COLUMN release_id text;
ALTER TABLE app.finance_entry_version ADD COLUMN category_id text, ADD COLUMN release_id text;

-- The existing texts become categories: one per project and key, named as first written, income or expense when
-- every entry of it is, else both; its author is the author of that first entry. Adding a category to an entry is a
-- change of the schema, not a revision, so the ledger triggers stay off for this backfill. FORCE row security
-- would hide every row from the migration role (no actor), so it is lifted for this transaction only.
ALTER TABLE app.finance_entry NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.finance_entry_version NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.finance_category NO FORCE ROW LEVEL SECURITY;
INSERT INTO app.finance_category(project_id,id,name,direction,revision,created_by,created_at,updated_by,updated_at)
SELECT project_id,'fc-'||substr(md5(project_id||':'||key),1,24),name,direction,1,created_by,created_at,created_by,created_at
FROM (
  SELECT DISTINCT ON (project_id,key) project_id,key,left(btrim(category),80) AS name,created_by,created_at,
    CASE WHEN bool_and(direction='income') OVER w THEN 'income' WHEN bool_and(direction='expense') OVER w THEN 'expense'
         ELSE 'both' END AS direction
  FROM (SELECT e.*,app.finance_category_key(e.category) AS key FROM app.finance_entry e) entries
  WINDOW w AS (PARTITION BY project_id,key)
  ORDER BY project_id,key,created_at,id
) firsts;
ALTER TABLE app.finance_entry DISABLE TRIGGER finance_entry_guard, DISABLE TRIGGER finance_entry_version;
UPDATE app.finance_entry e SET category_id=c.id FROM app.finance_category c
WHERE c.project_id=e.project_id AND c.name_key=app.finance_category_key(e.category);
UPDATE app.finance_entry_version v SET category_id=e.category_id FROM app.finance_entry e
WHERE e.project_id=v.project_id AND e.id=v.entry_id;
ALTER TABLE app.finance_entry ENABLE TRIGGER finance_entry_guard, ENABLE TRIGGER finance_entry_version;
ALTER TABLE app.finance_entry FORCE ROW LEVEL SECURITY;
ALTER TABLE app.finance_entry_version FORCE ROW LEVEL SECURITY;
ALTER TABLE app.finance_category FORCE ROW LEVEL SECURITY;

ALTER TABLE app.finance_entry ALTER COLUMN category_id SET NOT NULL,
  ADD CONSTRAINT fk_finance_entry__finance_category FOREIGN KEY(project_id,category_id) REFERENCES app.finance_category(project_id,id),
  ADD CONSTRAINT fk_finance_entry__releases FOREIGN KEY(project_id,release_id) REFERENCES app.releases(project_id,id);
ALTER TABLE app.finance_entry_version ALTER COLUMN category_id SET NOT NULL;
CREATE INDEX ix_finance_entry__category ON app.finance_entry(project_id,category_id);
CREATE INDEX ix_finance_entry__release ON app.finance_entry(project_id,release_id) WHERE release_id IS NOT NULL;

-- The ledger rules of V20260929000025 with the category and the release: voiding changes neither.
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
      NEW.category_id,NEW.release_id,NEW.description,NEW.counterparty,NEW.reference) IS DISTINCT FROM (OLD.direction,
      OLD.amount_minor,OLD.currency_code,OLD.due_date,OLD.posted_date,OLD.category,OLD.category_id,OLD.release_id,
      OLD.description,OLD.counterparty,OLD.reference) THEN
    RAISE EXCEPTION 'Voiding a finance entry changes only its state and reason' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.record_finance_entry_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO app.finance_entry_version(project_id,entry_id,revision,change,direction,state,amount_minor,currency_code,
    due_date,posted_date,category,category_id,release_id,description,counterparty,reference,void_reason,actor_id,created_at)
  VALUES (NEW.project_id,NEW.id,NEW.revision,
    CASE WHEN TG_OP='INSERT' THEN 'created'
         WHEN NEW.state='voided' THEN 'voided'
         WHEN OLD.state='planned' AND NEW.state='posted' THEN 'posted'
         ELSE 'updated' END,
    NEW.direction,NEW.state,NEW.amount_minor,NEW.currency_code,NEW.due_date,NEW.posted_date,NEW.category,
    NEW.category_id,NEW.release_id,NEW.description,NEW.counterparty,NEW.reference,NEW.void_reason,NEW.updated_by,
    NEW.updated_at);
  RETURN NULL;
END $$;

-- Read with finance.read, written with finance.write; nothing is deleted. Authors and times of the runtime role are
-- bound in afterMigrate.sql, as for the ledger.
ALTER TABLE app.finance_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.finance_category FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_category_read ON app.finance_category FOR SELECT USING(auth.can(project_id,'finance.read'));
CREATE POLICY finance_category_insert ON app.finance_category FOR INSERT WITH CHECK(auth.can(project_id,'finance.write'));
CREATE POLICY finance_category_update ON app.finance_category FOR UPDATE
  USING(auth.can(project_id,'finance.write')) WITH CHECK(auth.can(project_id,'finance.write'));

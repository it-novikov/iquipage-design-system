-- The project budget (docs/decisions/0009-finance-plan.md): a plan is a series of versions, each with its own lines.
-- A draft is edited; approving it freezes it in the database, and the previous approved version becomes superseded.
-- A revision starts a new draft from a copy of the lines. There are no monthly lines: a line is a sum for the whole
-- period of the plan, in one currency, for one category and direction.

CREATE TABLE app.finance_plan (
  project_id text NOT NULL,
  id text NOT NULL,
  name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  release_id text,
  revision integer NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pk_finance_plan PRIMARY KEY(project_id,id),
  CONSTRAINT fk_finance_plan__projects FOREIGN KEY(project_id) REFERENCES app.projects,
  CONSTRAINT fk_finance_plan__releases FOREIGN KEY(project_id,release_id) REFERENCES app.releases(project_id,id),
  CONSTRAINT fk_finance_plan__created_by FOREIGN KEY(created_by) REFERENCES auth.principals,
  CONSTRAINT fk_finance_plan__updated_by FOREIGN KEY(updated_by) REFERENCES auth.principals,
  CONSTRAINT ck_finance_plan__id CHECK(id ~ '^[A-Za-z0-9_-]{1,100}$'),
  CONSTRAINT ck_finance_plan__name CHECK(length(name) BETWEEN 1 AND 120 AND name=btrim(name)),
  CONSTRAINT ck_finance_plan__period CHECK(period_start<=period_end),
  CONSTRAINT ck_finance_plan__revision CHECK(revision>0)
);

CREATE TABLE app.finance_plan_version (
  project_id text NOT NULL,
  plan_id text NOT NULL,
  version integer NOT NULL,
  state text NOT NULL,
  note text,
  approved_by text,
  approved_at timestamptz,
  revision integer NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pk_finance_plan_version PRIMARY KEY(project_id,plan_id,version),
  CONSTRAINT fk_finance_plan_version__finance_plan FOREIGN KEY(project_id,plan_id) REFERENCES app.finance_plan(project_id,id),
  CONSTRAINT fk_finance_plan_version__approved_by FOREIGN KEY(approved_by) REFERENCES auth.principals,
  CONSTRAINT fk_finance_plan_version__created_by FOREIGN KEY(created_by) REFERENCES auth.principals,
  CONSTRAINT fk_finance_plan_version__updated_by FOREIGN KEY(updated_by) REFERENCES auth.principals,
  CONSTRAINT ck_finance_plan_version__version CHECK(version BETWEEN 1 AND 100),
  CONSTRAINT ck_finance_plan_version__state CHECK(state IN ('draft','approved','superseded')),
  CONSTRAINT ck_finance_plan_version__note CHECK(note IS NULL OR length(note) BETWEEN 1 AND 300),
  CONSTRAINT ck_finance_plan_version__approval CHECK((state='draft')=(approved_at IS NULL) AND (approved_by IS NULL)=(approved_at IS NULL)),
  CONSTRAINT ck_finance_plan_version__revision CHECK(revision>0)
);
-- At most one draft and one approved version per plan, whatever writes and however concurrently.
CREATE UNIQUE INDEX ux_finance_plan_version__draft ON app.finance_plan_version(project_id,plan_id) WHERE state='draft';
CREATE UNIQUE INDEX ux_finance_plan_version__approved ON app.finance_plan_version(project_id,plan_id) WHERE state='approved';

CREATE TABLE app.finance_plan_line (
  project_id text NOT NULL,
  plan_id text NOT NULL,
  version integer NOT NULL,
  position integer NOT NULL,
  direction text NOT NULL,
  category_id text NOT NULL,
  amount_minor bigint NOT NULL,
  currency_code text NOT NULL,
  release_id text,
  note text,
  CONSTRAINT pk_finance_plan_line PRIMARY KEY(project_id,plan_id,version,position),
  CONSTRAINT fk_finance_plan_line__finance_plan_version FOREIGN KEY(project_id,plan_id,version)
    REFERENCES app.finance_plan_version(project_id,plan_id,version),
  CONSTRAINT fk_finance_plan_line__finance_category FOREIGN KEY(project_id,category_id) REFERENCES app.finance_category(project_id,id),
  CONSTRAINT fk_finance_plan_line__releases FOREIGN KEY(project_id,release_id) REFERENCES app.releases(project_id,id),
  CONSTRAINT ck_finance_plan_line__position CHECK(position BETWEEN 1 AND 500),
  CONSTRAINT ck_finance_plan_line__direction CHECK(direction IN ('income','expense')),
  CONSTRAINT ck_finance_plan_line__amount_minor CHECK(amount_minor BETWEEN 0 AND 999999999999999),
  CONSTRAINT ck_finance_plan_line__currency_code CHECK(currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_finance_plan_line__note CHECK(note IS NULL OR length(note) BETWEEN 1 AND 300)
);
CREATE INDEX ix_finance_plan_line__category ON app.finance_plan_line(project_id,category_id);

-- A plan's identity and creation are fixed and each change adds one revision. Its period and release are what an
-- approved version was approved for: once a version left the draft state they no longer change.
CREATE FUNCTION app.guard_finance_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.revision<>1 THEN
      RAISE EXCEPTION 'A finance plan starts at revision 1' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'A finance plan change adds exactly one revision' USING ERRCODE='check_violation';
  END IF;
  IF NEW.project_id<>OLD.project_id OR NEW.id<>OLD.id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'The identity and creation of a finance plan are fixed' USING ERRCODE='check_violation';
  END IF;
  IF (NEW.period_start,NEW.period_end,NEW.release_id) IS DISTINCT FROM (OLD.period_start,OLD.period_end,OLD.release_id)
     AND EXISTS(SELECT 1 FROM app.finance_plan_version v
       WHERE v.project_id=OLD.project_id AND v.plan_id=OLD.id AND v.state<>'draft') THEN
    RAISE EXCEPTION 'The period and release of an approved finance plan are fixed' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finance_plan_guard BEFORE INSERT OR UPDATE ON app.finance_plan
  FOR EACH ROW EXECUTE FUNCTION app.guard_finance_plan();

-- A version starts as a draft at revision 1. A draft may change its note or be approved; an approved version may
-- only become superseded; a superseded one never changes. Nothing is deleted.
CREATE FUNCTION app.guard_finance_plan_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'A finance plan version is never deleted' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.revision<>1 OR NEW.state<>'draft' THEN
      RAISE EXCEPTION 'A finance plan version starts at revision 1 as a draft' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'A finance plan version change adds exactly one revision' USING ERRCODE='check_violation';
  END IF;
  IF (NEW.project_id,NEW.plan_id,NEW.version,NEW.created_by,NEW.created_at)
     IS DISTINCT FROM (OLD.project_id,OLD.plan_id,OLD.version,OLD.created_by,OLD.created_at) THEN
    RAISE EXCEPTION 'The identity and creation of a finance plan version are fixed' USING ERRCODE='check_violation';
  END IF;
  IF OLD.state='draft' THEN
    IF NEW.state NOT IN ('draft','approved') THEN
      RAISE EXCEPTION 'A draft finance plan version is approved, never superseded' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state='approved' AND NEW.state='superseded'
     AND (NEW.note,NEW.approved_by,NEW.approved_at) IS NOT DISTINCT FROM (OLD.note,OLD.approved_by,OLD.approved_at) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'An approved or superseded finance plan version cannot change' USING ERRCODE='check_violation';
END $$;
CREATE TRIGGER finance_plan_version_guard BEFORE INSERT OR UPDATE OR DELETE ON app.finance_plan_version
  FOR EACH ROW EXECUTE FUNCTION app.guard_finance_plan_version();

-- Lines change only with their draft. The version row is locked in share mode, so a line written while the draft
-- is being approved waits for that approval and then sees the version frozen. A release is named only by the lines
-- of a plan for the whole project: a release plan is that release already.
CREATE FUNCTION app.guard_finance_plan_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  line_project text;
  line_plan text;
  line_version integer;
  current_state text;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.project_id,NEW.plan_id,NEW.version) IS DISTINCT FROM (OLD.project_id,OLD.plan_id,OLD.version) THEN
    RAISE EXCEPTION 'A finance plan line stays in its version' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP='DELETE' THEN
    line_project := OLD.project_id; line_plan := OLD.plan_id; line_version := OLD.version;
  ELSE
    line_project := NEW.project_id; line_plan := NEW.plan_id; line_version := NEW.version;
  END IF;
  SELECT v.state INTO current_state FROM app.finance_plan_version v
  WHERE v.project_id=line_project AND v.plan_id=line_plan AND v.version=line_version FOR SHARE;
  IF current_state IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Lines of an approved or superseded finance plan version cannot change' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP<>'DELETE' AND NEW.release_id IS NOT NULL AND EXISTS(SELECT 1 FROM app.finance_plan p
      WHERE p.project_id=NEW.project_id AND p.id=NEW.plan_id AND p.release_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Only a plan for the whole project names releases on its lines' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP='DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finance_plan_line_guard BEFORE INSERT OR UPDATE OR DELETE ON app.finance_plan_line
  FOR EACH ROW EXECUTE FUNCTION app.guard_finance_plan_line();

ALTER TABLE app.finance_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.finance_plan FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_plan_read ON app.finance_plan FOR SELECT USING(auth.can(project_id,'finance.read'));
CREATE POLICY finance_plan_insert ON app.finance_plan FOR INSERT WITH CHECK(auth.can(project_id,'finance.write'));
CREATE POLICY finance_plan_update ON app.finance_plan FOR UPDATE
  USING(auth.can(project_id,'finance.write')) WITH CHECK(auth.can(project_id,'finance.write'));
ALTER TABLE app.finance_plan_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.finance_plan_version FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_plan_version_read ON app.finance_plan_version FOR SELECT USING(auth.can(project_id,'finance.read'));
CREATE POLICY finance_plan_version_insert ON app.finance_plan_version FOR INSERT WITH CHECK(auth.can(project_id,'finance.write'));
CREATE POLICY finance_plan_version_update ON app.finance_plan_version FOR UPDATE
  USING(auth.can(project_id,'finance.write')) WITH CHECK(auth.can(project_id,'finance.write'));
ALTER TABLE app.finance_plan_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.finance_plan_line FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_plan_line_read ON app.finance_plan_line FOR SELECT USING(auth.can(project_id,'finance.read'));
CREATE POLICY finance_plan_line_insert ON app.finance_plan_line FOR INSERT WITH CHECK(auth.can(project_id,'finance.write'));
CREATE POLICY finance_plan_line_update ON app.finance_plan_line FOR UPDATE
  USING(auth.can(project_id,'finance.write')) WITH CHECK(auth.can(project_id,'finance.write'));
-- Saving a draft replaces its lines; the trigger above refuses it for any version that is not a draft.
CREATE POLICY finance_plan_line_delete ON app.finance_plan_line FOR DELETE USING(auth.can(project_id,'finance.write'));

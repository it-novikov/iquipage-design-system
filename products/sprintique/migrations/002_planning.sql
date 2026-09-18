-- Additive migration for the new platform. 001 remains immutable.
ALTER TABLE app.workspaces ADD COLUMN timezone text NOT NULL DEFAULT 'UTC';
ALTER TABLE app.projects ADD COLUMN timezone text;
ALTER TABLE app.projects ADD COLUMN planning_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE app.tasks ADD COLUMN preparation text NOT NULL DEFAULT 'draft' CHECK(preparation IN ('draft','ready'));
ALTER TABLE app.tasks ADD COLUMN result text NOT NULL DEFAULT 'open' CHECK(result IN ('open','accepted'));
ALTER TABLE app.tasks ADD COLUMN assignment_mode text NOT NULL DEFAULT 'none' CHECK(assignment_mode IN ('inherit','assigned','none'));
ALTER TABLE app.tasks ADD COLUMN admitted boolean NOT NULL DEFAULT false;
ALTER TABLE app.tasks ADD COLUMN planned_start date;
UPDATE app.tasks SET preparation='ready',admitted=(release_id IS NULL),assignment_mode=CASE WHEN release_id IS NULL THEN 'none' ELSE 'assigned' END;
ALTER TABLE app.tasks ADD CHECK ((assignment_mode='assigned')=(release_id IS NOT NULL));
ALTER TABLE app.tasks ADD CHECK (planned_start IS NULL OR due IS NULL OR planned_start<=due);
ALTER TABLE app.releases ADD COLUMN lifecycle text NOT NULL DEFAULT 'planned' CHECK(lifecycle IN ('planned','active','closed','cancelled'));
ALTER TABLE app.releases ADD COLUMN format text NOT NULL DEFAULT 'flexible' CHECK(format IN ('flexible','timeboxed'));
ALTER TABLE app.releases ADD COLUMN planned_start date;
ALTER TABLE app.releases ADD COLUMN planned_end date;
ALTER TABLE app.releases ADD COLUMN deadline date;
ALTER TABLE app.releases ADD COLUMN scope_revision bigint NOT NULL DEFAULT 0;
UPDATE app.releases SET lifecycle=CASE WHEN status='released' THEN 'closed' ELSE 'planned' END,deadline=target_date;
ALTER TABLE app.releases ADD CHECK(planned_start IS NULL OR planned_end IS NULL OR planned_start<=planned_end);
ALTER TABLE app.releases ADD CHECK(format<>'timeboxed' OR (planned_start IS NOT NULL AND planned_end IS NOT NULL));

CREATE TABLE app.planning_plans (
  project_id text NOT NULL REFERENCES app.projects,id uuid NOT NULL,actor_id text NOT NULL REFERENCES auth.principals,
  credential_id text NOT NULL,initiator_id text NOT NULL,token_hash text NOT NULL,
  project_revision bigint NOT NULL,policy_version text NOT NULL,action_hash text NOT NULL,
  command jsonb NOT NULL,effects jsonb NOT NULL,summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
  PRIMARY KEY(project_id,id)
);
CREATE TABLE app.release_snapshots (
  project_id text NOT NULL, id uuid NOT NULL, release_id text NOT NULL,kind text NOT NULL CHECK(kind IN ('started','closed','cancelled')),
  operation_id uuid NOT NULL,items jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,id),FOREIGN KEY(project_id,release_id) REFERENCES app.releases(project_id,id)
);
CREATE TABLE app.planning_applied (
  project_id text NOT NULL,plan_id uuid NOT NULL,result jsonb NOT NULL,
  PRIMARY KEY(project_id,plan_id),FOREIGN KEY(project_id,plan_id) REFERENCES app.planning_plans(project_id,id)
);
-- A shared approval record, not a Planning-specific second approval system.
CREATE TABLE app.approvals (
  project_id text NOT NULL REFERENCES app.projects,id uuid NOT NULL,subject_kind text NOT NULL,subject_id text NOT NULL,
  action_hash text NOT NULL,requested_by text NOT NULL REFERENCES auth.principals,initiator_id text NOT NULL REFERENCES auth.principals,
  status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','rejected')),
  decided_by text REFERENCES auth.principals,decided_at timestamptz,expires_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,id),UNIQUE(project_id,subject_kind,subject_id),
  CHECK((status='proposed')=(decided_by IS NULL AND decided_at IS NULL))
);
CREATE TABLE app.milestones (
  project_id text NOT NULL REFERENCES app.projects,id text NOT NULL,title text NOT NULL,date date,
  revision integer NOT NULL DEFAULT 1,PRIMARY KEY(project_id,id)
);
CREATE TABLE app.temporal_constraints (
  project_id text NOT NULL REFERENCES app.projects,id text NOT NULL,
  source_kind text NOT NULL CHECK(source_kind IN ('task','release','milestone')),source_id text NOT NULL,
  target_kind text NOT NULL CHECK(target_kind IN ('task','release','milestone')),target_id text NOT NULL,
  relation text NOT NULL CHECK(relation IN ('FS','SS','FF','SF')),lag_days integer NOT NULL,
  revision integer NOT NULL DEFAULT 1,PRIMARY KEY(project_id,id),
  CHECK(source_kind<>target_kind OR source_id<>target_id)
);
ALTER TABLE app.audit_events ADD COLUMN operation_id uuid;
ALTER TABLE app.audit_events ADD COLUMN correlation_id uuid;
ALTER TABLE app.audit_events ADD COLUMN causation_id uuid;
CREATE FUNCTION app.bump_planning_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE app.projects SET planning_revision=planning_revision+1 WHERE id=NEW.project_id;
  RETURN NEW;
END $$;
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['tasks','releases','milestones','temporal_constraints'] LOOP
    EXECUTE format('CREATE TRIGGER planning_revision_change AFTER INSERT OR UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.bump_planning_revision()',tab);
  END LOOP;
  FOREACH tab IN ARRAY ARRAY['planning_plans','planning_applied','release_snapshots','approvals','milestones','temporal_constraints'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY tenant_policy ON app.%I USING(auth.can_project(project_id)) WITH CHECK(auth.can_project(project_id))',tab);
  END LOOP;
END $$;
CREATE INDEX planning_expiry ON app.planning_plans(expires_at);
CREATE INDEX task_parent ON app.tasks(project_id,parent_id);
CREATE INDEX task_release ON app.tasks(project_id,release_id);

CREATE TABLE app.agent_runs (
 project_id text NOT NULL REFERENCES app.projects,id uuid NOT NULL,
 agent_id text NOT NULL REFERENCES auth.principals,credential_id text NOT NULL REFERENCES auth.credentials,
 initiator_id text NOT NULL REFERENCES auth.principals,goal text NOT NULL CHECK(length(goal) BETWEEN 1 AND 1000),
 state text NOT NULL CHECK(state IN ('running','awaiting_approval','completed','failed','cancelled')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),max_proposals integer NOT NULL CHECK(max_proposals BETWEEN 1 AND 20),
 used_proposals integer NOT NULL DEFAULT 0 CHECK(used_proposals BETWEEN 0 AND 20),latest_plan_id uuid,
 parent_run_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 completed_at timestamptz,error_code text CHECK(error_code IN ('AGENT_FAILED','CONTEXT_CHANGED','PROVIDER_UNAVAILABLE')),
 PRIMARY KEY(project_id,id),FOREIGN KEY(project_id,parent_run_id) REFERENCES app.agent_runs(project_id,id)
);
CREATE TABLE app.agent_run_plans (
 project_id text NOT NULL,run_id uuid NOT NULL,plan_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,plan_id),FOREIGN KEY(project_id,run_id) REFERENCES app.agent_runs(project_id,id),
 FOREIGN KEY(project_id,plan_id) REFERENCES app.planning_plans(project_id,id)
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['agent_runs','agent_run_plans'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_policy ON app.%I USING(auth.can_project(project_id)) WITH CHECK(auth.can_project(project_id))',tab);
 END LOOP;
END $$;
CREATE INDEX agent_runs_page ON app.agent_runs(project_id,id);

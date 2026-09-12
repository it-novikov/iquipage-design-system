CREATE TABLE app.maps (
  project_id text NOT NULL REFERENCES app.projects, id text NOT NULL,
  revision integer NOT NULL CHECK(revision>0), value jsonb NOT NULL,
  timer_remaining integer NOT NULL DEFAULT 300 CHECK(timer_remaining BETWEEN 0 AND 14400), timer_ends_at timestamptz,
  created_by text NOT NULL REFERENCES auth.principals,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz, archived_at timestamptz, PRIMARY KEY(project_id,id)
);
CREATE TABLE app.map_versions (
  project_id text NOT NULL, id text NOT NULL, revision integer NOT NULL,
  value jsonb NOT NULL, actor_id text NOT NULL REFERENCES auth.principals,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,id,revision),
  FOREIGN KEY(project_id,id) REFERENCES app.maps(project_id,id)
);
CREATE TABLE app.map_votes (
  project_id text NOT NULL, map_id text NOT NULL, actor_id text NOT NULL REFERENCES auth.principals,
  votes jsonb NOT NULL, PRIMARY KEY(project_id,map_id,actor_id), FOREIGN KEY(project_id,map_id) REFERENCES app.maps(project_id,id)
);
CREATE TABLE app.map_templates (
  project_id text NOT NULL REFERENCES app.projects, workspace_id uuid NOT NULL REFERENCES app.workspaces, id text NOT NULL,
  owner_id text NOT NULL REFERENCES auth.principals, scope text NOT NULL CHECK(scope IN ('personal','project','workspace')),
  revision integer NOT NULL CHECK(revision>0), value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,id)
);
CREATE TABLE app.map_template_versions (
  project_id text NOT NULL, id text NOT NULL, revision integer NOT NULL,
  value jsonb NOT NULL, actor_id text NOT NULL REFERENCES auth.principals, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,id,revision), FOREIGN KEY(project_id,id) REFERENCES app.map_templates(project_id,id)
);
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['maps','map_versions','map_votes','map_template_versions'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY tenant_policy ON app.%I USING(auth.can_project(project_id)) WITH CHECK(auth.can_project(project_id))',tab);
  END LOOP;
END $$;
ALTER TABLE app.map_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.map_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY template_read ON app.map_templates FOR SELECT USING(
 (scope='personal' AND owner_id=auth.actor_id() AND auth.can_project(project_id)) OR
 (scope='project' AND auth.can_project(project_id)) OR
 (scope='workspace' AND auth.can_workspace(workspace_id) AND coalesce(current_setting('app.project_limit',true),'')='')
);
CREATE POLICY template_insert ON app.map_templates FOR INSERT WITH CHECK(owner_id=auth.actor_id() AND auth.can_project(project_id));
CREATE POLICY template_update ON app.map_templates FOR UPDATE USING(auth.can_project(project_id) AND (scope<>'personal' OR owner_id=auth.actor_id())) WITH CHECK(auth.can_project(project_id));
CREATE INDEX maps_page ON app.maps(project_id,id);
CREATE INDEX map_template_workspace ON app.map_templates(workspace_id,id);

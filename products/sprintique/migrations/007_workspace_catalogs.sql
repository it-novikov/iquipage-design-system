ALTER TABLE app.releases ADD CONSTRAINT release_reserved_id CHECK(id<>'backlog');
CREATE TABLE app.task_settings (
  project_id text PRIMARY KEY REFERENCES app.projects,id text NOT NULL,
  revision integer NOT NULL CHECK(revision>0),value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE app.task_settings_versions (
  project_id text NOT NULL REFERENCES app.projects,revision integer NOT NULL CHECK(revision>0),
  value jsonb NOT NULL,actor_id text NOT NULL REFERENCES auth.principals,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,revision)
);
CREATE TABLE app.task_links (
  project_id text NOT NULL REFERENCES app.projects,id text NOT NULL,kind text NOT NULL CHECK(kind IN ('depends','related')),
  from_id text NOT NULL,to_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(project_id,id),
  FOREIGN KEY(project_id,from_id) REFERENCES app.tasks(project_id,id),FOREIGN KEY(project_id,to_id) REFERENCES app.tasks(project_id,id),CHECK(from_id<>to_id)
);
CREATE UNIQUE INDEX task_link_identity ON app.task_links(project_id,kind,
  (CASE WHEN kind='related' THEN least(from_id,to_id) ELSE from_id END),
  (CASE WHEN kind='related' THEN greatest(from_id,to_id) ELSE to_id END)) WHERE archived_at IS NULL;
CREATE INDEX task_link_from ON app.task_links(project_id,from_id) WHERE archived_at IS NULL;
CREATE INDEX task_link_to ON app.task_links(project_id,to_id) WHERE archived_at IS NULL;
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['task_settings','task_settings_versions','task_links'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY project_access ON app.%I USING(auth.can_project(project_id)) WITH CHECK(auth.can_project(project_id))',tab);
  END LOOP;
END $$;
CREATE INDEX task_search ON app.tasks USING gin(to_tsvector('simple',title||' '||description));

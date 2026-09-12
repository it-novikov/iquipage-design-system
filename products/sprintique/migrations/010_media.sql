CREATE TABLE app.assets (
  project_id text NOT NULL REFERENCES app.projects, id text NOT NULL,
  target_type text NOT NULL CHECK(target_type IN ('task','map','project-avatar')), target_id text NOT NULL,
  actor_id text NOT NULL REFERENCES auth.principals, name text NOT NULL, size integer NOT NULL CHECK(size BETWEEN 1 AND 10485760), sha256 text NOT NULL,
  state text NOT NULL CHECK(state IN ('uploading','ready','attached','detached','quarantined','deleted')) DEFAULT 'uploading',
  mime text, image boolean NOT NULL DEFAULT false,width integer,height integer,
  revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '24 hours', PRIMARY KEY(project_id,id)
);
ALTER TABLE app.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.assets FORCE ROW LEVEL SECURITY;
CREATE POLICY asset_tenant ON app.assets USING(auth.can_project(project_id)) WITH CHECK(auth.can_project(project_id));
CREATE INDEX asset_cleanup ON app.assets(expires_at) WHERE state IN ('uploading','ready','detached','quarantined');
ALTER TABLE app.tasks ADD COLUMN attachment_ids text[] NOT NULL DEFAULT '{}',ADD COLUMN cover_attachment_id text,ADD COLUMN cover_crop jsonb;
ALTER TABLE app.tasks ADD CONSTRAINT task_cover_attachment CHECK(cover_attachment_id IS NULL OR cover_attachment_id=ANY(attachment_ids));

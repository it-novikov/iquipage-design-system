-- A person's settings for one project that follow them to every device. The first: which release the board shows —
-- a release id, 'backlog' for tasks without a release, or NULL for the running release. Only the person reads and
-- changes them, and only while they reach the project.
CREATE TABLE app.person_project_preferences (
  principal_id text NOT NULL REFERENCES auth.principals,
  project_id text NOT NULL REFERENCES app.projects,
  board_release text CHECK(board_release ~ '^[A-Za-z0-9_-]{1,100}$'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(principal_id, project_id)
);
ALTER TABLE app.person_project_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.person_project_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY person_project_preferences_own ON app.person_project_preferences
  USING(principal_id=auth.actor_id() AND auth.can_project(project_id))
  WITH CHECK(principal_id=auth.actor_id() AND auth.can_project(project_id));

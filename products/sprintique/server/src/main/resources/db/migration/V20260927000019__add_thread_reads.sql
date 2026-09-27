-- Per-person read markers for discussions, so "new" follows a person across devices.
-- A marker is the last activity a person has seen in a thread; it only ever moves forward.
CREATE TABLE app.thread_reads (
  project_id text NOT NULL, thread_id text NOT NULL, principal_id text NOT NULL REFERENCES auth.principals,
  read_at timestamptz NOT NULL,
  PRIMARY KEY(project_id,thread_id,principal_id),
  FOREIGN KEY(project_id,thread_id) REFERENCES app.threads(project_id,id)
);
ALTER TABLE app.thread_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.thread_reads FORCE ROW LEVEL SECURITY;
-- A person sees and moves only their own markers, and only inside projects they can access.
CREATE POLICY thread_reads_own ON app.thread_reads
  USING(auth.can_project(project_id) AND principal_id=auth.actor_id())
  WITH CHECK(auth.can_project(project_id) AND principal_id=auth.actor_id());

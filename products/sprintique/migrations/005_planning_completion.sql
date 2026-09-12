-- Keep the task's contractual deadline separate from its planned interval.
ALTER TABLE app.tasks ADD COLUMN planned_end date;
UPDATE app.tasks SET planned_end=due WHERE planned_start IS NOT NULL;
ALTER TABLE app.tasks ADD CONSTRAINT task_planned_interval CHECK(planned_start IS NULL OR planned_end IS NULL OR planned_start<=planned_end);
ALTER TABLE app.milestones ADD COLUMN release_id text;
ALTER TABLE app.milestones ADD CONSTRAINT milestone_release FOREIGN KEY(project_id,release_id) REFERENCES app.releases(project_id,id);
ALTER TABLE app.projects ADD COLUMN planning_defaults jsonb NOT NULL DEFAULT '{"format":"flexible","days":14}'::jsonb;
CREATE TABLE app.planning_selections (
  project_id text NOT NULL REFERENCES app.projects(id),id uuid NOT NULL,actor_id text NOT NULL REFERENCES auth.principals(id),
  credential_id text NOT NULL REFERENCES auth.credentials(id),project_revision bigint NOT NULL,filter jsonb NOT NULL,
  expires_at timestamptz NOT NULL,PRIMARY KEY(project_id,id)
);
ALTER TABLE app.planning_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.planning_selections FORCE ROW LEVEL SECURITY;
CREATE POLICY project_access ON app.planning_selections USING(auth.can_project(project_id)) WITH CHECK(auth.can_project(project_id));
CREATE TRIGGER tags_planning_revision AFTER INSERT OR UPDATE ON app.tags FOR EACH ROW EXECUTE FUNCTION app.bump_planning_revision();
CREATE FUNCTION app.bump_planning_revision_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE app.projects SET planning_revision=planning_revision+1 WHERE id=OLD.project_id;
  RETURN OLD;
END $$;
CREATE TRIGGER constraint_deleted_planning_revision AFTER DELETE ON app.temporal_constraints FOR EACH ROW EXECUTE FUNCTION app.bump_planning_revision_delete();

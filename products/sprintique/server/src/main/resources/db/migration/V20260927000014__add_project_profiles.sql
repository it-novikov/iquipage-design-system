ALTER TABLE app.projects ADD COLUMN profile_revision integer NOT NULL DEFAULT 1 CHECK(profile_revision>0), ADD COLUMN avatar_asset_id text;
ALTER TABLE app.projects ADD CONSTRAINT project_avatar FOREIGN KEY(id,avatar_asset_id) REFERENCES app.assets(project_id,id);
ALTER TABLE app.workspaces ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
CREATE POLICY workspace_update ON app.workspaces FOR UPDATE USING(auth.can_workspace(id));
-- Workspace administrators may inspect the project directory, not project contents.
-- Content policies still use can_project and HTTP authorization still requires project membership.
CREATE POLICY projects_workspace_catalog ON app.projects FOR SELECT USING(
 coalesce(current_setting('app.project_limit',true),'')='' AND EXISTS(
  SELECT 1 FROM app.workspace_members WHERE workspace_id=app.projects.workspace_id AND principal_id=auth.actor_id() AND role='admin'
 )
);
CREATE TABLE app.workspace_audit (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES app.workspaces,
 actor_id text NOT NULL REFERENCES auth.principals,action text NOT NULL,resource_id text NOT NULL,
 revision integer NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE app.workspace_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspace_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_audit_tenant ON app.workspace_audit USING(auth.can_workspace(workspace_id)) WITH CHECK(auth.can_workspace(workspace_id));

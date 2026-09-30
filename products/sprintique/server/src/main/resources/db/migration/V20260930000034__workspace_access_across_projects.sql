-- Workspace access managers act on projects they need not belong to (docs/access/access-and-invitations.md, part I):
-- taking a person out of the workspace with their projects («Люди пространства») and editing a preset recompile
-- memberships in any project of the workspace. What follows from that in a project is recorded there and the
-- person's open requests become orphaned (docs/adr W1), both under row security that otherwise admits members of the
-- project only.

-- Whether the actor manages access in a workspace: people («Управлять людьми») or presets and rules («Настраивать
-- пространство»). Never under a project limit (a project agent). Workspace members carry no row security.
CREATE FUNCTION auth.manages_workspace_access(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT coalesce(current_setting('app.project_limit',true),'')='' AND EXISTS(
    SELECT 1 FROM app.workspace_members w WHERE w.workspace_id=target AND w.principal_id=auth.actor_id()
      AND w.permissions && ARRAY['workspace.people','workspace.settings'])
$$;
REVOKE ALL ON FUNCTION auth.manages_workspace_access(uuid) FROM PUBLIC;

-- The same for the workspace of a project, read from its memberships (a project always has an administrator, and
-- the person concerned is still a member when this is asked), never from app.projects, whose policies call it.
CREATE FUNCTION auth.can_manage_workspace_access(target text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT coalesce(auth.manages_workspace_access(
    (SELECT m.workspace_id FROM app.project_members m WHERE m.project_id=target LIMIT 1)), false)
$$;
REVOKE ALL ON FUNCTION auth.can_manage_workspace_access(text) FROM PUBLIC;

-- Their own events in such a project: audit and outbox rows, written as themselves.
CREATE POLICY workspace_access_audit ON app.audit_events FOR INSERT
  WITH CHECK(actor_id=auth.actor_id() AND auth.can_manage_workspace_access(project_id));
CREATE POLICY workspace_access_outbox ON app.outbox FOR INSERT
  WITH CHECK(auth.can_manage_workspace_access(project_id));

-- Orphaning the open requests of the one person whose access is being taken: `app.leaving` names them for that
-- statement only (MemberAccess.stopsChanging sets and clears it). The requests, and what orphaning writes through
-- app.append_task_activity: the project's activity position and the task's activity entry.
CREATE POLICY workspace_access_leaving_read ON app.attention_requests FOR SELECT
  USING(recipient_id=current_setting('app.leaving',true) AND auth.can_manage_workspace_access(project_id));
CREATE POLICY workspace_access_leaving ON app.attention_requests FOR UPDATE
  USING(recipient_id=current_setting('app.leaving',true) AND status='open' AND auth.can_manage_workspace_access(project_id))
  WITH CHECK(recipient_id=current_setting('app.leaving',true) AND status='orphaned'
    AND auth.can_manage_workspace_access(project_id));
CREATE POLICY workspace_access_leaving_project_read ON app.projects FOR SELECT
  USING(coalesce(current_setting('app.leaving',true),'')<>'' AND auth.manages_workspace_access(workspace_id));
CREATE POLICY workspace_access_leaving_project ON app.projects FOR UPDATE
  USING(coalesce(current_setting('app.leaving',true),'')<>'' AND auth.manages_workspace_access(workspace_id))
  WITH CHECK(coalesce(current_setting('app.leaving',true),'')<>'' AND auth.manages_workspace_access(workspace_id));
CREATE POLICY workspace_access_leaving_activity ON app.task_activity FOR INSERT
  WITH CHECK(coalesce(current_setting('app.leaving',true),'')<>'' AND auth.can_manage_workspace_access(project_id));

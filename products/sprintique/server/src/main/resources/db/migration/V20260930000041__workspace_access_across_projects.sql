-- Workspace access managers act on projects they need not belong to (docs/access/access-and-invitations.md, part I):
-- taking a person out of the workspace with their projects («Люди пространства») and editing a preset recompile
-- memberships in any project of the workspace. What follows from that in a project is recorded there and the
-- person's open requests become orphaned (docs/adr W1), both under row security that otherwise admits members of the
-- project only. The server opens that one window with `app.leaving` naming the person (MemberAccess.leaving, local to
-- the transaction, never from a client): only in the projects that person is still a member of, only for what the
-- window writes.

-- Whether the actor manages access in a workspace: people («Управлять людьми») or presets and rules («Настраивать
-- пространство»). Never under a project limit (a project agent). Workspace members carry no row security.
CREATE FUNCTION auth.manages_workspace_access(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT coalesce(current_setting('app.project_limit',true),'')='' AND EXISTS(
    SELECT 1 FROM app.workspace_members w WHERE w.workspace_id=target AND w.principal_id=auth.actor_id()
      AND w.permissions && ARRAY['workspace.people','workspace.settings'])
$$;
REVOKE ALL ON FUNCTION auth.manages_workspace_access(uuid) FROM PUBLIC;

-- Whether the window is open in this project: the person named by app.leaving is a member of it, and the actor
-- manages access in its workspace. Read from memberships (no row security), never from app.projects, whose
-- policies call it.
CREATE FUNCTION auth.leaving_in(target text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT coalesce(current_setting('app.leaving',true),'')<>'' AND coalesce((
    SELECT auth.manages_workspace_access(m.workspace_id) FROM app.project_members m
    WHERE m.project_id=target AND m.principal_id=current_setting('app.leaving',true)), false)
$$;
REVOKE ALL ON FUNCTION auth.leaving_in(text) FROM PUBLIC;

-- The actor's own events there: audit and outbox rows.
CREATE POLICY workspace_access_audit ON app.audit_events FOR INSERT
  WITH CHECK(actor_id=auth.actor_id() AND auth.leaving_in(project_id));
CREATE POLICY workspace_access_outbox ON app.outbox FOR INSERT
  WITH CHECK(auth.leaving_in(project_id));
-- The person's open requests, only to orphan them.
CREATE POLICY workspace_access_leaving_read ON app.attention_requests FOR SELECT
  USING(recipient_id=current_setting('app.leaving',true) AND auth.leaving_in(project_id));
CREATE POLICY workspace_access_leaving ON app.attention_requests FOR UPDATE
  USING(recipient_id=current_setting('app.leaving',true) AND status='open' AND auth.leaving_in(project_id))
  WITH CHECK(recipient_id=current_setting('app.leaving',true) AND status='orphaned' AND auth.leaving_in(project_id));
-- The project row, which holds the positions of its outbox and activity and is locked before the requests.
CREATE POLICY workspace_access_leaving_project_read ON app.projects FOR SELECT USING(auth.leaving_in(id));
CREATE POLICY workspace_access_leaving_project ON app.projects FOR UPDATE
  USING(auth.leaving_in(id)) WITH CHECK(auth.leaving_in(id));
-- The activity entry that orphaning a request writes, as the actor.
CREATE POLICY workspace_access_leaving_activity ON app.task_activity FOR INSERT
  WITH CHECK(actor_id=auth.actor_id() AND kind='request' AND auth.leaving_in(project_id));

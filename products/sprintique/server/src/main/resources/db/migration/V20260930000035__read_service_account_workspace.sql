-- MCP list_projects named a service account's workspace with an empty string. app.workspaces forces row security on
-- its owner too, so auth.service_account_workspace() (security definer) found no row for a principal that is not a
-- workspace member. A service account may now read the one workspace it belongs to while it is active and reaches at
-- least one project there; other workspaces stay hidden, and people are unaffected.
CREATE FUNCTION auth.can_read_service_workspace(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM auth.service_accounts s WHERE s.principal_id=auth.actor_id() AND s.workspace_id=target
      AND auth.service_account_active(s.principal_id))
    AND EXISTS(SELECT 1 FROM app.projects p WHERE p.workspace_id=target AND auth.can_project(p.id))
$$;
REVOKE ALL ON FUNCTION auth.can_read_service_workspace(uuid) FROM PUBLIC;
CREATE POLICY workspace_read_service ON app.workspaces FOR SELECT USING(auth.can_read_service_workspace(id));

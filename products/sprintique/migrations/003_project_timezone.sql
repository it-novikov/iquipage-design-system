-- Project-bound agents need the inherited timezone, not access to all workspace data.
CREATE FUNCTION auth.project_timezone(target text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT coalesce(p.timezone,w.timezone) FROM app.projects p JOIN app.workspaces w ON w.id=p.workspace_id
  WHERE p.id=target AND auth.can_project(target)
$$;
REVOKE ALL ON FUNCTION auth.project_timezone(text) FROM PUBLIC;

-- Member join date: new memberships record it; earlier ones stay unknown (NULL) rather than a made-up date.
ALTER TABLE app.project_members ADD COLUMN joined_at timestamptz;
ALTER TABLE app.project_members ALTER COLUMN joined_at SET DEFAULT clock_timestamp();
-- Verified e-mail from the identity provider, shown only to its owner. Never used to match identities.
ALTER TABLE auth.principals ADD COLUMN email text CHECK(email IS NULL OR (length(email) BETWEEN 3 AND 320 AND position('@' in email)>1));
-- Last activity per member comes from the audit trail.
CREATE INDEX audit_actor_recent ON app.audit_events(project_id,actor_id,created_at DESC);
-- Workspace catalog: workspace administrators see every project with its member count; other members see the
-- projects they belong to. It lists names only and grants no access to project data.
CREATE FUNCTION auth.workspace_projects(target uuid) RETURNS TABLE(id text,name text,slug text,key text,members integer,role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT p.id,p.name,p.slug,p.key,
    (SELECT count(*)::int FROM app.project_members m JOIN auth.principals x ON x.id=m.principal_id WHERE m.project_id=p.id AND x.kind='human' AND x.disabled_at IS NULL),
    (SELECT m.role FROM app.project_members m WHERE m.project_id=p.id AND m.principal_id=auth.actor_id())
  FROM app.projects p
  WHERE p.workspace_id=target AND EXISTS(SELECT 1 FROM app.workspace_members w WHERE w.workspace_id=target AND w.principal_id=auth.actor_id())
    AND (EXISTS(SELECT 1 FROM app.workspace_members w WHERE w.workspace_id=target AND w.principal_id=auth.actor_id() AND w.role='admin')
      OR EXISTS(SELECT 1 FROM app.project_members m WHERE m.project_id=p.id AND m.principal_id=auth.actor_id()))
  ORDER BY p.name,p.id LIMIT 501
$$;
REVOKE ALL ON FUNCTION auth.workspace_projects(uuid) FROM PUBLIC;
-- Where the project's time zone comes from: its own setting, or inherited from the workspace (and which one).
CREATE FUNCTION auth.project_timezone_source(target text) RETURNS TABLE(inherited boolean,workspace_timezone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT p.timezone IS NULL,w.timezone FROM app.projects p JOIN app.workspaces w ON w.id=p.workspace_id
  WHERE p.id=target AND auth.can_project(target)
$$;
REVOKE ALL ON FUNCTION auth.project_timezone_source(text) FROM PUBLIC;

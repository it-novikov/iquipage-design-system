-- Existing roles become presets without losing any access (docs/access/access-and-invitations.md, 7.1):
-- every workspace gets the system presets; a project administrator gets Администратор, an editor Редактор, a reader
-- Наблюдатель (which may now also write in discussions, as the owner decided); a project agent gets «Сервис: задачи»
-- plus «Менять карты» when one of its live grants allows maps:write. The owner of a workspace is an administrator who
-- is a person: an enabled one first, the creator first among them, then by identifier (join dates were never
-- recorded). A workspace without such an administrator gets no owner (docs/operations.md says how to set one). The
-- derived role of every membership must stay what it was; the migration stops otherwise.

-- FORCE row security would hide every row from the migration role (no actor): lifted for this data move only.
ALTER TABLE app.projects NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.workspaces NO FORCE ROW LEVEL SECURITY;

SELECT auth.provision_access_presets(id) FROM app.workspaces;

-- Workspace owners.
WITH chosen AS (
  SELECT DISTINCT ON (m.workspace_id) m.workspace_id, m.principal_id
  FROM app.workspace_members m JOIN app.workspaces w ON w.id=m.workspace_id JOIN auth.principals p ON p.id=m.principal_id
  WHERE m.role='admin' AND p.kind='human'
  ORDER BY m.workspace_id, (p.disabled_at IS NULL) DESC, (m.principal_id=w.created_by) DESC, m.principal_id)
UPDATE app.workspace_members m SET role='owner' FROM chosen c
WHERE m.workspace_id=c.workspace_id AND m.principal_id=c.principal_id;
-- Compiles the workspace permissions of every member (the trigger of the previous migration).
UPDATE app.workspace_members SET granted=granted;

-- Project memberships: workspace, preset, and the explicit map permission of agents that had it.
CREATE TEMPORARY TABLE previous_roles ON COMMIT DROP AS
  SELECT project_id, principal_id, role FROM app.project_members;
UPDATE app.project_members m SET workspace_id=p.workspace_id,
  preset_id=(SELECT a.id FROM app.access_presets a WHERE a.workspace_id=p.workspace_id AND a.key=
    CASE WHEN x.kind='human' THEN m.role WHEN m.role='reader' THEN 'service_read' ELSE 'service_tasks' END),
  granted=CASE WHEN x.kind<>'human' AND EXISTS(SELECT 1 FROM auth.credentials c WHERE c.principal_id=m.principal_id
      AND c.kind='agent' AND c.revoked_at IS NULL AND 'maps:write' = ANY(c.capabilities)) THEN ARRAY['maps.write'] ELSE '{}' END
FROM app.projects p, auth.principals x WHERE p.id=m.project_id AND x.id=m.principal_id;
ALTER TABLE app.project_members ALTER COLUMN workspace_id SET NOT NULL, ALTER COLUMN preset_id SET NOT NULL;

CREATE TRIGGER project_member_compile BEFORE INSERT OR UPDATE ON app.project_members
  FOR EACH ROW EXECUTE FUNCTION app.compile_project_member();
UPDATE app.project_members SET granted=granted;

DO $$ DECLARE changed integer; BEGIN
  SELECT count(*) INTO changed FROM app.project_members m JOIN previous_roles r USING(project_id,principal_id)
  WHERE m.role<>r.role OR NOT ('tasks.read' = ANY(m.permissions));
  IF changed>0 THEN RAISE EXCEPTION 'Migrating roles to presets would change % memberships', changed; END IF;
END $$;

ALTER TABLE app.projects FORCE ROW LEVEL SECURITY;
ALTER TABLE app.workspaces FORCE ROW LEVEL SECURITY;

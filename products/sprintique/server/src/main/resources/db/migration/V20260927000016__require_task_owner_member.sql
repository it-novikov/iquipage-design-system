-- A task owner is a project member, not free text.
ALTER TABLE app.tasks ADD COLUMN owner_id text REFERENCES auth.principals;
CREATE INDEX task_owner ON app.tasks(project_id,owner_id);
-- New rows carry no legacy label; it stays only for pre-membership text.
ALTER TABLE app.tasks ALTER COLUMN owner_label SET DEFAULT '';

-- FORCE RLS would hide every row from the migration role (no actor), so the backfill
-- lifts it only for this transaction's data move and restores it immediately after.
ALTER TABLE app.tasks NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.projects NO FORCE ROW LEVEL SECURITY;
-- Map each legacy label to the single human member of that project with the same display name.
UPDATE app.tasks t SET owner_id=m.principal_id
FROM (
  SELECT pm.project_id,coalesce(p.profile_name,p.name) AS name,min(pm.principal_id) AS principal_id,count(*) AS matches
  FROM app.project_members pm JOIN auth.principals p ON p.id=pm.principal_id AND p.kind='human'
  GROUP BY pm.project_id,coalesce(p.profile_name,p.name)
) m
WHERE m.project_id=t.project_id AND m.name=t.owner_label AND m.matches=1 AND t.owner_label<>'';
-- A mapped owner no longer needs its label. Unmatched labels stay visible as legacy text until reassigned.
UPDATE app.tasks SET owner_label='' WHERE owner_id IS NOT NULL AND owner_label<>'';
ALTER TABLE app.tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE app.projects FORCE ROW LEVEL SECURITY;

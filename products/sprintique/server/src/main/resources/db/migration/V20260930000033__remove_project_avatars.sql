-- Projects no longer have an avatar (the owner's decision of 2026-09-30): a project is known by its name, and people
-- keep their photos. Workspaces never had one in vNext.
--
-- Existing project avatars leave through the ordinary cleanup, the way a replaced avatar always did: every such asset
-- still holding objects is detached with an immediate expiry and gets an asset.gc job, which the worker runs to delete
-- its objects (original and previews) and mark it deleted. The rows stay as the history of any cleaned file does.
-- Row security binds the table owner too (FORCE); it is lifted only for this data move and restored right after.
ALTER TABLE app.assets NO FORCE ROW LEVEL SECURITY;
WITH detached AS (
  UPDATE app.assets SET state='detached', revision=revision+1, updated_at=clock_timestamp(), expires_at=clock_timestamp()
  WHERE target_type='project-avatar' AND state NOT IN ('quarantined','deleting','deleted')
  RETURNING project_id, id, revision
)
INSERT INTO work.jobs(project_id, kind, dedupe_key, payload, available_at)
SELECT project_id, 'asset.gc', id||':'||revision, jsonb_build_object('assetId', id), clock_timestamp() FROM detached
ON CONFLICT (project_id, kind, dedupe_key) DO NOTHING;
ALTER TABLE app.assets FORCE ROW LEVEL SECURITY;

ALTER TABLE app.projects DROP CONSTRAINT project_avatar;
ALTER TABLE app.projects DROP COLUMN avatar_asset_id;

-- Nothing makes a new one: the API no longer reserves this target, and the database refuses a live one.
ALTER TABLE app.assets ADD CONSTRAINT asset_project_avatar_retired
  CHECK(target_type<>'project-avatar' OR state IN ('quarantined','detached','deleting','deleted'));

-- Service accounts on the permission catalog (docs/access/access-and-invitations.md, part II, II.5). Until now a
-- service account held a project role (reader or editor) plus explicit finance grants (auth.service_account_grants,
-- V20260929000027), capped at run time by its owner's role. From here it is a membership like any other: a service
-- preset («Сервис: чтение», «Сервис: задачи» or the workspace's own), personal additions and removals, and the
-- compiled permissions, which the database caps by its owner's permissions in the same project on every write and
-- recompiles whenever the owner's permissions or the owner change. Never the decisions and access of people
-- (auth.never_service_permissions); finance only when added one by one.

-- The compile rule of V20260930000037 with the owner's ceiling for a service account.
CREATE OR REPLACE FUNCTION app.compile_project_member() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE
  principal_kind text;
  workspace_role text;
  preset_workspace uuid;
  preset_subject text;
  base text[];
  forbidden text[] := ARRAY[]::text[];
  ceiling text[];
  legacy_key text;
BEGIN
  SELECT kind INTO STRICT principal_kind FROM auth.principals WHERE id=NEW.principal_id;
  IF NEW.preset_id IS NULL OR (TG_OP='UPDATE' AND NEW.role IS DISTINCT FROM OLD.role AND NEW.preset_id IS NOT DISTINCT FROM OLD.preset_id) THEN
    IF NEW.workspace_id IS NULL THEN
      SELECT workspace_id INTO NEW.workspace_id FROM app.projects WHERE id=NEW.project_id;
    END IF;
    SELECT m.role INTO workspace_role FROM app.workspace_members m WHERE m.workspace_id=NEW.workspace_id AND m.principal_id=NEW.principal_id;
    legacy_key := CASE WHEN principal_kind<>'human' THEN CASE WHEN NEW.role='reader' THEN 'service_read' ELSE 'service_tasks' END
      WHEN workspace_role='guest' AND coalesce(NEW.role,'reader')='reader' THEN 'guest' ELSE coalesce(NEW.role,'reader') END;
    SELECT id INTO NEW.preset_id FROM app.access_presets WHERE workspace_id=NEW.workspace_id AND key=legacy_key;
    IF NEW.preset_id IS NULL THEN
      RAISE EXCEPTION 'A project membership needs a preset' USING ERRCODE='check_violation';
    END IF;
    IF TG_OP='UPDATE' THEN NEW.granted := '{}'; NEW.revoked := '{}'; END IF;
  END IF;
  SELECT p.workspace_id, p.subject, p.permissions INTO STRICT preset_workspace, preset_subject, base
    FROM app.access_presets p WHERE p.id=NEW.preset_id;
  NEW.workspace_id := coalesce(NEW.workspace_id, preset_workspace);
  IF NEW.workspace_id<>preset_workspace THEN
    RAISE EXCEPTION 'The preset belongs to another workspace' USING ERRCODE='check_violation';
  END IF;
  SELECT m.role INTO workspace_role FROM app.workspace_members m WHERE m.workspace_id=NEW.workspace_id AND m.principal_id=NEW.principal_id;
  IF workspace_role='guest' THEN forbidden := forbidden || ARRAY['project.access']; END IF;
  IF principal_kind<>'human' THEN
    forbidden := forbidden || auth.never_service_permissions();
    base := array(SELECT unnest(base) EXCEPT SELECT unnest(auth.explicit_service_permissions()));
  ELSIF preset_subject<>'human' THEN
    RAISE EXCEPTION 'A person gets a preset for people' USING ERRCODE='check_violation';
  END IF;
  -- Never above its owner in this project; nothing beyond membership while the owner is not a member here.
  IF principal_kind='service' THEN
    SELECT coalesce((SELECT o.permissions FROM auth.service_accounts s
      JOIN app.project_members o ON o.project_id=NEW.project_id AND o.principal_id=s.owner_id
      WHERE s.principal_id=NEW.principal_id), ARRAY[]::text[]) INTO ceiling;
  END IF;
  -- Unknown names are refused, not dropped: a writer that means a permission must name one of the catalog.
  IF NOT (coalesce(NEW.granted,'{}') <@ auth.project_permission_catalog() AND coalesce(NEW.revoked,'{}') <@ auth.project_permission_catalog()) THEN
    RAISE EXCEPTION 'new row violates the permission catalog: %', array_to_string(NEW.granted || NEW.revoked, ',')
      USING ERRCODE='check_violation';
  END IF;
  NEW.granted := auth.permission_sort(NEW.granted);
  NEW.revoked := auth.permission_sort(NEW.revoked);
  NEW.permissions := auth.compile_permissions(base, NEW.granted, NEW.revoked, forbidden, ceiling);
  NEW.role := CASE WHEN 'project.access' = ANY(NEW.permissions) THEN 'admin'
    WHEN 'tasks.write' = ANY(NEW.permissions) THEN 'editor' ELSE 'reader' END;
  RETURN NEW;
END $$;

-- When a person's permissions in a project change, or they leave it, their service accounts there are compiled again
-- in the same transaction: an account never keeps more than its owner has now.
CREATE FUNCTION app.recompile_owned_service_accounts() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE
  owner text := CASE WHEN TG_OP='DELETE' THEN OLD.principal_id ELSE NEW.principal_id END;
  project text := CASE WHEN TG_OP='DELETE' THEN OLD.project_id ELSE NEW.project_id END;
BEGIN
  IF TG_OP='UPDATE' AND NEW.permissions IS NOT DISTINCT FROM OLD.permissions THEN RETURN NULL; END IF;
  UPDATE app.project_members m SET revision=m.revision+1
  WHERE m.project_id=project
    AND m.principal_id IN (SELECT s.principal_id FROM auth.service_accounts s WHERE s.owner_id=owner AND s.deleted_at IS NULL);
  RETURN NULL;
END $$;
CREATE TRIGGER project_member_owner_ceiling AFTER INSERT OR UPDATE OR DELETE ON app.project_members
  FOR EACH ROW EXECUTE FUNCTION app.recompile_owned_service_accounts();

-- An account made (or given a new owner) after its memberships were written gets its owner's ceiling now.
CREATE FUNCTION app.recompile_service_account() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  UPDATE app.project_members SET revision=revision+1 WHERE principal_id=NEW.principal_id;
  RETURN NULL;
END $$;
CREATE TRIGGER service_account_owner_ceiling AFTER INSERT OR UPDATE OF owner_id ON auth.service_accounts
  FOR EACH ROW EXECUTE FUNCTION app.recompile_service_account();

-- Existing grants keep what they gave: an editor wrote tasks, discussions and maps («Сервис: задачи» plus «Менять
-- карты»), a reader read them («Сервис: чтение»); explicit finance moves into the personal additions. The owner's
-- ceiling that used to apply at run time is now compiled in. Under V20260929000027 an account wrote nothing while its
-- owner in the project did not write tasks, discussions included; a reader («Наблюдатель») comments now, so such an
-- account keeps «Писать в обсуждениях» removed rather than gain it.
UPDATE app.project_members m SET
  preset_id=(SELECT a.id FROM app.access_presets a WHERE a.workspace_id=m.workspace_id
    AND a.key=CASE WHEN m.role='editor' THEN 'service_tasks' ELSE 'service_read' END),
  granted=auth.permission_sort(CASE WHEN m.role='editor' THEN ARRAY['maps.write'] ELSE ARRAY[]::text[] END
    || coalesce((SELECT g.granted FROM auth.service_account_grants g WHERE g.project_id=m.project_id AND g.principal_id=m.principal_id), ARRAY[]::text[])),
  revoked=CASE WHEN m.role='editor' AND EXISTS(SELECT 1 FROM auth.service_accounts s
      JOIN app.project_members o ON o.project_id=m.project_id AND o.principal_id=s.owner_id
      WHERE s.principal_id=m.principal_id AND NOT 'tasks.write' = ANY(o.permissions))
    THEN ARRAY['threads.write'] ELSE ARRAY[]::text[] END
FROM auth.principals p WHERE p.id=m.principal_id AND p.kind='service';

-- An account acts only while its owner is an enabled member of its workspace who is not a guest: guests neither make
-- nor own service accounts (part II, II.2), so an owner made a guest stops the account however it came about.
CREATE OR REPLACE FUNCTION auth.service_account_active(target text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(
    SELECT 1 FROM auth.service_accounts s
    JOIN auth.principals a ON a.id=s.principal_id JOIN auth.principals o ON o.id=s.owner_id
    WHERE s.principal_id=target AND s.deleted_at IS NULL AND s.suspended_at IS NULL
      AND a.disabled_at IS NULL AND o.disabled_at IS NULL
      AND EXISTS(SELECT 1 FROM app.workspace_members w
        WHERE w.workspace_id=s.workspace_id AND w.principal_id=s.owner_id AND w.role<>'guest'))
$$;

-- A permission holds only while its holder may see the project at all: for a service account that means active,
-- with its owner a member of the project (auth.can_project, V20260929000027).
CREATE OR REPLACE FUNCTION auth.can(target text, permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT auth.can_project(target) AND EXISTS(SELECT 1 FROM app.project_members
    WHERE project_id=target AND principal_id=auth.actor_id() AND permission = ANY(permissions))
$$;

-- The role-and-flag model is gone: the membership row is the whole grant.
DROP TRIGGER project_members_service_role ON app.project_members;
DROP FUNCTION auth.service_account_role_check();
DROP FUNCTION auth.service_account_granted(text,text);
DROP TABLE auth.service_account_grants;

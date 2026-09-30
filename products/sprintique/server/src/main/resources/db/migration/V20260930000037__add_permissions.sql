-- Permissions instead of roles (docs/access/access-and-invitations.md, part I). Access is a set of named permissions
-- from a fixed catalog: fourteen in a project, five in a workspace. A project membership starts from a preset (an
-- editable named set) and may add or remove single permissions; the effective set is compiled onto the membership
-- row, so row security and the application check one row. The role columns stay, derived from the permissions, for
-- the code and the pages that still read them.

-- The catalog, in the order people see it. Dependencies: a permission includes the ones it lists.
CREATE FUNCTION auth.permission_catalog() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT ARRAY['tasks.read','tasks.write','threads.write','releases.manage','maps.read','maps.write',
    'finance.read','finance.write','approvals.decide','agents.manage','members.invite','members.manage',
    'project.settings','project.access',
    'workspace.invite','workspace.people','projects.create','projects.oversee','workspace.settings']
$$;
CREATE FUNCTION auth.project_permission_catalog() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$ SELECT (auth.permission_catalog())[1:14] $$;
CREATE FUNCTION auth.workspace_permission_catalog() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$ SELECT (auth.permission_catalog())[15:19] $$;
CREATE FUNCTION auth.permission_implies(permission text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT CASE permission
    WHEN 'tasks.write' THEN ARRAY['tasks.read']
    WHEN 'threads.write' THEN ARRAY['tasks.read']
    WHEN 'releases.manage' THEN ARRAY['tasks.write']
    WHEN 'maps.read' THEN ARRAY['tasks.read']
    WHEN 'maps.write' THEN ARRAY['maps.read']
    WHEN 'finance.read' THEN ARRAY['tasks.read']
    WHEN 'finance.write' THEN ARRAY['finance.read']
    WHEN 'approvals.decide' THEN ARRAY['tasks.write']
    WHEN 'agents.manage' THEN ARRAY['tasks.read']
    WHEN 'members.invite' THEN ARRAY['tasks.read']
    WHEN 'members.manage' THEN ARRAY['members.invite']
    WHEN 'project.settings' THEN ARRAY['tasks.read']
    WHEN 'project.access' THEN ARRAY['members.manage','project.settings']
    WHEN 'workspace.people' THEN ARRAY['workspace.invite']
    ELSE ARRAY[]::text[] END
$$;
-- Known permissions only, each once, in catalog order.
CREATE FUNCTION auth.permission_sort(permissions text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT coalesce(array_agg(p ORDER BY o), ARRAY[]::text[])
  FROM unnest(auth.permission_catalog()) WITH ORDINALITY AS c(p,o) WHERE p = ANY(coalesce(permissions, ARRAY[]::text[]))
$$;
-- The permissions and everything they include.
CREATE FUNCTION auth.permission_closure(permissions text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  WITH RECURSIVE included(p) AS (
    SELECT unnest(coalesce(permissions, ARRAY[]::text[]))
    UNION SELECT unnest(auth.permission_implies(included.p)) FROM included)
  SELECT auth.permission_sort(array_agg(p)) FROM included
$$;
-- Permissions a service account (or a legacy project agent) never holds: the decisions and the access of people.
CREATE FUNCTION auth.never_service_permissions() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT ARRAY['approvals.decide','agents.manage','members.invite','members.manage','project.settings','project.access',
    'workspace.invite','workspace.people','projects.create','projects.oversee','workspace.settings']
$$;
-- Permissions a principal other than a person gets only when they are added one by one, never from a preset.
CREATE FUNCTION auth.explicit_service_permissions() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$ SELECT ARRAY['finance.read','finance.write'] $$;

-- The one rule that turns a preset and personal changes into effective permissions:
--   closure(base ∪ granted ∪ {tasks.read}) without every permission whose closure meets (revoked ∪ forbidden),
--   then ∩ ceiling when a ceiling is given (a service account's owner, see part II).
-- `tasks.read` cannot be removed: it is what membership means. The application computes the same (Permissions.kt);
-- an integration test compares them.
CREATE FUNCTION auth.compile_permissions(base text[], granted text[], revoked text[], forbidden text[] DEFAULT ARRAY[]::text[],
  ceiling text[] DEFAULT NULL) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT auth.permission_sort(array_agg(p)) FROM unnest(auth.permission_closure(
      coalesce(base, ARRAY[]::text[]) || coalesce(granted, ARRAY[]::text[]) || ARRAY['tasks.read'])) AS p
  WHERE NOT (auth.permission_closure(ARRAY[p]) && array_remove(coalesce(revoked, ARRAY[]::text[]) || coalesce(forbidden, ARRAY[]::text[]), 'tasks.read'))
    AND (ceiling IS NULL OR p = ANY(ceiling) OR p = 'tasks.read')
$$;
-- The same rule for the five workspace permissions (no base permission).
CREATE FUNCTION auth.compile_workspace_permissions(base text[], granted text[], revoked text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT auth.permission_sort(array_agg(p)) FROM unnest(auth.permission_closure(coalesce(base, ARRAY[]::text[]) || coalesce(granted, ARRAY[]::text[]))) AS p
  WHERE p = ANY(auth.workspace_permission_catalog()) AND NOT (auth.permission_closure(ARRAY[p]) && coalesce(revoked, ARRAY[]::text[]))
$$;
-- What the system presets hold out of the box ("Вернуть по умолчанию" restores exactly this).
CREATE FUNCTION auth.default_preset_permissions(key text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT auth.permission_closure(CASE key
    WHEN 'admin' THEN auth.project_permission_catalog()
    WHEN 'editor' THEN ARRAY['tasks.write','threads.write','releases.manage','maps.write','finance.read','approvals.decide']
    WHEN 'reader' THEN ARRAY['tasks.read','threads.write','maps.read','finance.read']
    WHEN 'guest' THEN ARRAY['tasks.read','threads.write','maps.read']
    WHEN 'service_read' THEN ARRAY['tasks.read','maps.read']
    WHEN 'service_tasks' THEN ARRAY['tasks.write','threads.write','maps.read']
    ELSE ARRAY['tasks.read'] END)
$$;
-- The permissions of a workspace role: the owner and administrators hold all five, members and guests none (members
-- may create projects when the workspace allows it, see auth.can_workspace_do).
CREATE FUNCTION auth.workspace_role_permissions(role text) RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT CASE WHEN role IN ('owner','admin') THEN auth.workspace_permission_catalog() ELSE ARRAY[]::text[] END
$$;

-- Presets of project permissions, per workspace. The system ones carry a key (Администратор is locked; the others
-- can be edited and reset); custom ones have none, at most ten live ones per workspace (the application counts).
-- `subject` separates presets for people from the presets for service accounts (part II), which never hold
-- the permissions in auth.never_service_permissions(). Like the membership tables, this is policy input read through
-- the application's checks, not a business collection, so it has no row security.
CREATE TABLE app.access_presets (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES app.workspaces,
  subject text NOT NULL DEFAULT 'human' CHECK(subject IN ('human','service')),
  key text CHECK(key IN ('admin','editor','reader','guest','service_read','service_tasks')),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 40),
  hint text NOT NULL DEFAULT '' CHECK(length(hint) <= 140),
  permissions text[] NOT NULL,
  locked boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_by text REFERENCES auth.principals,
  updated_by text REFERENCES auth.principals,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz,
  UNIQUE(workspace_id,key),
  CHECK(permissions <@ auth.project_permission_catalog() AND 'tasks.read' = ANY(permissions)),
  CHECK(subject='human' OR NOT (permissions && (auth.never_service_permissions() || auth.explicit_service_permissions()))),
  CHECK(NOT locked OR key='admin')
);
-- Names are unique per workspace ignoring case; the application compares them (SQL lower() depends on the collation).
CREATE UNIQUE INDEX access_presets_name ON app.access_presets(workspace_id,name) WHERE archived_at IS NULL;
-- A preset's permissions are always closed under their dependencies.
CREATE FUNCTION app.normalize_access_preset() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  NEW.permissions := auth.permission_closure(NEW.permissions || ARRAY['tasks.read']);
  IF NEW.key='admin' THEN NEW.permissions := auth.project_permission_catalog(); NEW.locked := true; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER access_preset_normalize BEFORE INSERT OR UPDATE ON app.access_presets
  FOR EACH ROW EXECUTE FUNCTION app.normalize_access_preset();

-- The system presets of one workspace; for every new workspace (trigger below) and by the migration of existing ones.
CREATE FUNCTION auth.provision_access_presets(target uuid) RETURNS void
LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$
  INSERT INTO app.access_presets(id,workspace_id,subject,key,name,hint,permissions,locked)
  SELECT gen_random_uuid(),target,s.subject,s.key,s.name,s.hint,auth.default_preset_permissions(s.key),s.key='admin'
  FROM (VALUES
    ('human','admin','Администратор','Все права проекта.'),
    ('human','editor','Редактор','Ведёт задачи, карты и релизы, решает по предложениям агентов.'),
    ('human','reader','Наблюдатель','Читает и пишет в обсуждениях. Ничего не меняет.'),
    ('human','guest','Гость','Как Наблюдатель, но без финансов. Для внешних людей.'),
    ('service','service_read','Сервис: чтение','Читает задачи и карты.'),
    ('service','service_tasks','Сервис: задачи','Ведёт задачи и пишет в обсуждениях, читает карты.')
  ) AS s(subject,key,name,hint)
  ON CONFLICT (workspace_id,key) DO NOTHING
$$;
-- Every new workspace gets them at once, whoever creates it (the application, a data import, a test).
CREATE FUNCTION app.provision_workspace_presets() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM auth.provision_access_presets(NEW.id);
  RETURN NULL;
END $$;
CREATE TRIGGER workspace_presets AFTER INSERT ON app.workspaces FOR EACH ROW EXECUTE FUNCTION app.provision_workspace_presets();

ALTER TABLE app.workspaces
  ADD COLUMN projects_created_by text NOT NULL DEFAULT 'admins' CHECK(projects_created_by IN ('admins','members')),
  ADD COLUMN default_member_preset_id uuid REFERENCES app.access_presets,
  ADD COLUMN default_guest_preset_id uuid REFERENCES app.access_presets,
  ADD COLUMN access_revision integer NOT NULL DEFAULT 1 CHECK(access_revision>0);
ALTER TABLE app.projects
  ADD COLUMN default_member_preset_id uuid REFERENCES app.access_presets,
  ADD COLUMN default_guest_preset_id uuid REFERENCES app.access_presets,
  ADD COLUMN access_revision integer NOT NULL DEFAULT 1 CHECK(access_revision>0);

-- Workspace roles: one owner, administrators, members and guests. A guest sees only the projects it was let into,
-- is not in the directory and never holds project.access.
DO $$ DECLARE constraint_name text; BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint
  WHERE conrelid='app.workspace_members'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%''member''%''admin''%';
  EXECUTE format('ALTER TABLE app.workspace_members DROP CONSTRAINT %I',constraint_name);
END $$;
ALTER TABLE app.workspace_members ADD CONSTRAINT workspace_member_role CHECK(role IN ('owner','admin','member','guest'));
ALTER TABLE app.workspace_members
  ADD COLUMN granted text[] NOT NULL DEFAULT '{}',
  ADD COLUMN revoked text[] NOT NULL DEFAULT '{}',
  ADD COLUMN permissions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN joined_at timestamptz,
  ADD COLUMN invited_by text REFERENCES auth.principals,
  ADD CONSTRAINT workspace_member_permissions CHECK(granted <@ auth.workspace_permission_catalog()
    AND revoked <@ auth.workspace_permission_catalog() AND (role<>'guest' OR cardinality(granted)=0));
-- Earlier members keep an unknown join date rather than a made-up one.
ALTER TABLE app.workspace_members ALTER COLUMN joined_at SET DEFAULT clock_timestamp();
CREATE UNIQUE INDEX workspace_one_owner ON app.workspace_members(workspace_id) WHERE role='owner';
CREATE FUNCTION app.compile_workspace_member() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  NEW.granted := auth.permission_sort(NEW.granted);
  NEW.revoked := auth.permission_sort(NEW.revoked);
  NEW.permissions := CASE WHEN NEW.role='owner' THEN auth.workspace_permission_catalog()
    ELSE auth.compile_workspace_permissions(auth.workspace_role_permissions(NEW.role),NEW.granted,NEW.revoked) END;
  RETURN NEW;
END $$;
CREATE TRIGGER workspace_member_compile BEFORE INSERT OR UPDATE ON app.workspace_members
  FOR EACH ROW EXECUTE FUNCTION app.compile_workspace_member();

-- A project membership: its workspace (so a preset of another workspace cannot be used), preset, personal additions
-- and removals, the compiled permissions, who changed them last.
ALTER TABLE app.project_members
  ADD COLUMN workspace_id uuid,
  ADD COLUMN preset_id uuid REFERENCES app.access_presets,
  ADD COLUMN granted text[] NOT NULL DEFAULT '{}',
  ADD COLUMN revoked text[] NOT NULL DEFAULT '{}',
  ADD COLUMN permissions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN changed_by text REFERENCES auth.principals,
  ADD COLUMN changed_at timestamptz,
  ADD CONSTRAINT project_member_workspace FOREIGN KEY(workspace_id,project_id) REFERENCES app.projects(workspace_id,id),
  ADD CONSTRAINT project_member_permissions CHECK(granted <@ auth.project_permission_catalog()
    AND revoked <@ auth.project_permission_catalog() AND NOT ('tasks.read' = ANY(revoked)));
CREATE INDEX project_members_preset ON app.project_members(preset_id);
CREATE INDEX project_members_principal ON app.project_members(principal_id);

-- Compiles every write of a project membership, so the stored permissions always equal the rule above:
-- * the preset comes from `preset_id` and must belong to the membership's workspace; a writer that only sets `role`
--   (code that predates presets) gets the system preset of that role (a guest reader gets Гость) and loses personal
--   changes, as a role change always did;
-- * a guest of the workspace never holds project.access;
-- * a principal that is not a person never holds auth.never_service_permissions() and gets finance only when added;
-- * `role` is derived: admin with project.access, editor with tasks.write, reader otherwise.
CREATE FUNCTION app.compile_project_member() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE
  principal_kind text;
  workspace_role text;
  preset_workspace uuid;
  preset_subject text;
  base text[];
  forbidden text[] := ARRAY[]::text[];
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
  NEW.granted := auth.permission_sort(NEW.granted);
  NEW.revoked := auth.permission_sort(NEW.revoked);
  NEW.permissions := auth.compile_permissions(base, NEW.granted, NEW.revoked, forbidden);
  NEW.role := CASE WHEN 'project.access' = ANY(NEW.permissions) THEN 'admin'
    WHEN 'tasks.write' = ANY(NEW.permissions) THEN 'editor' ELSE 'reader' END;
  RETURN NEW;
END $$;
-- Created by the next migration, after existing rows got their presets.

-- The permission check: one membership row by its key. `app.project_limit` still confines a project agent.
CREATE FUNCTION auth.can(target text, permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM app.project_members WHERE project_id=target AND principal_id=auth.actor_id() AND permission = ANY(permissions))
    AND (coalesce(current_setting('app.project_limit',true),'')='' OR current_setting('app.project_limit',true)=target)
$$;
-- A workspace permission of the caller. Members create projects when the workspace allows it.
CREATE FUNCTION auth.can_workspace_do(target uuid, permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM app.workspace_members m WHERE m.workspace_id=target AND m.principal_id=auth.actor_id()
    AND (permission = ANY(m.permissions) OR (permission='projects.create' AND m.role='member'
      AND NOT ('projects.create' = ANY(m.revoked))
      AND EXISTS(SELECT 1 FROM app.workspaces w WHERE w.id=target AND w.projects_created_by='members'))))
    AND coalesce(current_setting('app.project_limit',true),'')=''
$$;

-- Finance follows its two permissions instead of the project role.
CREATE OR REPLACE FUNCTION auth.can_read_finance(target text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT auth.can(target,'finance.read') $$;
CREATE OR REPLACE FUNCTION auth.can_manage_finance(target text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT auth.can(target,'finance.write') $$;

-- The project directory follows projects.oversee instead of the administrator role.
DROP POLICY projects_workspace_catalog ON app.projects;
CREATE POLICY projects_workspace_catalog ON app.projects FOR SELECT USING(
  coalesce(current_setting('app.project_limit',true),'')='' AND EXISTS(
    SELECT 1 FROM app.workspace_members WHERE workspace_id=app.projects.workspace_id AND principal_id=auth.actor_id()
      AND 'projects.oversee' = ANY(permissions)));
CREATE OR REPLACE FUNCTION auth.workspace_projects(target uuid) RETURNS TABLE(id text,name text,slug text,key text,members integer,role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT p.id,p.name,p.slug,p.key,
    (SELECT count(*)::int FROM app.project_members m JOIN auth.principals x ON x.id=m.principal_id WHERE m.project_id=p.id AND x.kind='human' AND x.disabled_at IS NULL),
    (SELECT m.role FROM app.project_members m WHERE m.project_id=p.id AND m.principal_id=auth.actor_id())
  FROM app.projects p
  WHERE p.workspace_id=target AND EXISTS(SELECT 1 FROM app.workspace_members w WHERE w.workspace_id=target AND w.principal_id=auth.actor_id())
    AND (auth.can_workspace_do(target,'projects.oversee')
      OR EXISTS(SELECT 1 FROM app.project_members m WHERE m.project_id=p.id AND m.principal_id=auth.actor_id()))
  ORDER BY p.name,p.id LIMIT 501
$$;
-- Projects are created by those the workspace allows.
DROP POLICY projects_insert ON app.projects;
CREATE POLICY projects_insert ON app.projects FOR INSERT WITH CHECK(auth.can_workspace_do(workspace_id,'projects.create'));

-- What changed, for access events: presets before and after, added and removed permissions. Names and identifiers
-- only, never a secret.
ALTER TABLE app.audit_events ADD COLUMN details jsonb;
ALTER TABLE app.workspace_audit ADD COLUMN details jsonb;

REVOKE ALL ON FUNCTION auth.permission_catalog(),auth.project_permission_catalog(),auth.workspace_permission_catalog(),
  auth.permission_implies(text),auth.permission_sort(text[]),auth.permission_closure(text[]),auth.never_service_permissions(),
  auth.explicit_service_permissions(),auth.compile_permissions(text[],text[],text[],text[],text[]),
  auth.compile_workspace_permissions(text[],text[],text[]),auth.default_preset_permissions(text),
  auth.workspace_role_permissions(text),auth.provision_access_presets(uuid),auth.can(text,text),
  auth.can_workspace_do(uuid,text) FROM PUBLIC;

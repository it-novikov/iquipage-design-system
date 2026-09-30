-- Invitations by e-mail and by link, with presets (docs/access/access-and-invitations.md, section 5). One row is one
-- letter to one address, or one link without a letter. The token is 256 random bits shown once (in the letter or to
-- the person who made the link); only its SHA-256 is stored. «Отправить снова» makes a new row with a new token and
-- marks the old one replaced, so an old link says so instead of working. The names the invitation shows before
-- sign-in (workspace, projects, preset, inviter) are copied into the row: whoever holds the token sees them without
-- being a member yet. Like auth.credentials this table is read before an access context exists; the runtime role's
-- grants and the application's checks protect it, not row security.
CREATE TABLE auth.invitations (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES app.workspaces,
  kind text NOT NULL CHECK(kind IN ('email','link')),
  email text CHECK(email IS NULL OR (length(email) BETWEEN 3 AND 320 AND position('@' in email)>1 AND email=lower(email))),
  token_hash text NOT NULL UNIQUE CHECK(length(token_hash)=64),
  workspace_role text NOT NULL CHECK(workspace_role IN ('admin','member','guest')),
  project_preset_id uuid REFERENCES app.access_presets,
  project_ids text[] NOT NULL DEFAULT '{}' CHECK(cardinality(project_ids) <= 100),
  -- Made from a project's settings by someone who may invite to that project only: the invitee joins as a guest.
  from_project_id text REFERENCES app.projects,
  inviter_id text NOT NULL REFERENCES auth.principals,
  workspace_name text NOT NULL CHECK(length(workspace_name) BETWEEN 1 AND 100),
  project_names text[] NOT NULL DEFAULT '{}',
  preset_name text CHECK(preset_name IS NULL OR length(preset_name) BETWEEN 1 AND 40),
  preset_hint text CHECK(preset_hint IS NULL OR length(preset_hint) <= 140),
  inviter_name text NOT NULL CHECK(length(inviter_name) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  -- Letters only: pending until the relay answered; sent means the relay accepted it (bounces are not tracked).
  delivery text NOT NULL CHECK(delivery IN ('pending','sent','failed','link')),
  delivered_at timestamptz,
  delivery_error text CHECK(delivery_error IS NULL OR length(delivery_error) <= 200),
  resent_from uuid REFERENCES auth.invitations,
  resend_count integer NOT NULL DEFAULT 0 CHECK(resend_count BETWEEN 0 AND 5),
  replaced_at timestamptz,
  revoked_at timestamptz,
  revoked_by text REFERENCES auth.principals,
  accepted_at timestamptz,
  accepted_by text REFERENCES auth.principals,
  CHECK((kind='email')=(email IS NOT NULL)),
  CHECK((kind='link')=(delivery='link')),
  CHECK((project_preset_id IS NULL)=(cardinality(project_ids)=0)),
  CHECK(cardinality(project_names)=cardinality(project_ids)),
  CHECK((accepted_at IS NULL)=(accepted_by IS NULL)),
  CHECK(from_project_id IS NULL OR (workspace_role='guest' AND project_ids=ARRAY[from_project_id]))
);
CREATE INDEX invitations_workspace ON auth.invitations(workspace_id,created_at DESC);
CREATE INDEX invitations_email ON auth.invitations(email,created_at) WHERE email IS NOT NULL;
CREATE INDEX invitations_inviter ON auth.invitations(inviter_id,created_at);
CREATE INDEX invitations_pending ON auth.invitations(workspace_id,expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL AND replaced_at IS NULL;

-- Links made before this migration keep working until they expire: the same token hash, the preset of their role,
-- and the workspace as a member (what accepting one always did).
ALTER TABLE app.projects NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.workspaces NO FORCE ROW LEVEL SECURITY;
INSERT INTO auth.invitations(id,workspace_id,kind,token_hash,workspace_role,project_preset_id,project_ids,inviter_id,
  workspace_name,project_names,preset_name,preset_hint,inviter_name,created_at,expires_at,delivery,revoked_at,accepted_at,accepted_by)
SELECT i.id,p.workspace_id,'link',i.token_hash,'member',a.id,ARRAY[p.id],i.inviter_id,left(w.name,100),ARRAY[p.name],a.name,a.hint,
  left(coalesce(x.profile_name,x.name),100),i.created_at,i.expires_at,'link',i.revoked_at,i.accepted_at,i.accepted_by
FROM auth.project_invitations i JOIN app.projects p ON p.id=i.project_id JOIN app.workspaces w ON w.id=p.workspace_id
JOIN app.access_presets a ON a.workspace_id=p.workspace_id AND a.key=i.role JOIN auth.principals x ON x.id=i.inviter_id;
ALTER TABLE app.projects FORCE ROW LEVEL SECURITY;
ALTER TABLE app.workspaces FORCE ROW LEVEL SECURITY;
DROP TABLE auth.project_invitations;

ALTER TABLE app.project_members ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE app.workspace_members ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE auth.principals ADD COLUMN profile_name text CHECK(length(profile_name) BETWEEN 1 AND 100);
ALTER TABLE auth.principals ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
-- Token lookup must work before project membership exists. This is an authentication
-- table, never a tenant collection or generic HTTP table endpoint. Only hashes persist.
CREATE TABLE auth.project_invitations (
 id uuid PRIMARY KEY, project_id text NOT NULL REFERENCES app.projects,
 token_hash text NOT NULL UNIQUE, role text NOT NULL CHECK(role IN ('reader','editor','admin')),
 inviter_id text NOT NULL REFERENCES auth.principals, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, accepted_at timestamptz,
 accepted_by text REFERENCES auth.principals, CHECK((accepted_at IS NULL)=(accepted_by IS NULL))
);
CREATE INDEX project_invitation_active ON auth.project_invitations(project_id,expires_at) WHERE revoked_at IS NULL AND accepted_at IS NULL;

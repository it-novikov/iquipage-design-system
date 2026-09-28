-- A person's own photo, shown next to their name everywhere they work. It is small (a 256×256 WebP the server
-- re-encodes itself), so it lives in the database rather than in project-scoped file storage.
CREATE TABLE app.person_avatars (
  principal_id text PRIMARY KEY REFERENCES auth.principals,
  image bytea NOT NULL CHECK(octet_length(image) BETWEEN 1 AND 262144),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Who may see a photo: the person, and anyone who shares a project or a workspace with them.
CREATE FUNCTION auth.can_see_person(target text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT target=auth.actor_id()
    OR EXISTS(SELECT 1 FROM app.project_members a JOIN app.project_members b ON b.project_id=a.project_id
      WHERE a.principal_id=auth.actor_id() AND b.principal_id=target)
    OR EXISTS(SELECT 1 FROM app.workspace_members a JOIN app.workspace_members b ON b.workspace_id=a.workspace_id
      WHERE a.principal_id=auth.actor_id() AND b.principal_id=target)
$$;
REVOKE ALL ON FUNCTION auth.can_see_person(text) FROM PUBLIC;
ALTER TABLE app.person_avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.person_avatars FORCE ROW LEVEL SECURITY;
CREATE POLICY person_avatar_read ON app.person_avatars FOR SELECT USING(auth.can_see_person(principal_id));
CREATE POLICY person_avatar_insert ON app.person_avatars FOR INSERT WITH CHECK(principal_id=auth.actor_id());
CREATE POLICY person_avatar_update ON app.person_avatars FOR UPDATE USING(principal_id=auth.actor_id()) WITH CHECK(principal_id=auth.actor_id());
CREATE POLICY person_avatar_delete ON app.person_avatars FOR DELETE USING(principal_id=auth.actor_id());

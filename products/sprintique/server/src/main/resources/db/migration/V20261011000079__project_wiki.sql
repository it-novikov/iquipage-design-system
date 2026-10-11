CREATE TABLE app.wiki_page (
 project_id text NOT NULL REFERENCES app.projects(id),
 id text NOT NULL CHECK(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 parent_id text,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200 AND title=btrim(title)),
 body text NOT NULL CHECK(length(body)<=100000),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by text NOT NULL REFERENCES auth.principals(id),
 PRIMARY KEY(project_id,id),
 FOREIGN KEY(project_id,parent_id) REFERENCES app.wiki_page(project_id,id),
 CHECK(parent_id IS DISTINCT FROM id)
);
CREATE INDEX wiki_page_parent ON app.wiki_page(project_id,parent_id,id);
CREATE INDEX wiki_page_search ON app.wiki_page USING gin(to_tsvector('simple',title||' '||body));
CREATE TABLE app.wiki_version (
 project_id text NOT NULL,
 page_id text NOT NULL,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 body text NOT NULL CHECK(length(body)<=100000),
 actor_id text NOT NULL REFERENCES auth.principals(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,page_id,revision),
 FOREIGN KEY(project_id,page_id) REFERENCES app.wiki_page(project_id,id)
);
CREATE TABLE app.wiki_task_link (
 project_id text NOT NULL,
 task_id text NOT NULL,
 page_id text NOT NULL,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,task_id,page_id),
 FOREIGN KEY(project_id,task_id) REFERENCES app.tasks(project_id,id),
 FOREIGN KEY(project_id,page_id) REFERENCES app.wiki_page(project_id,id)
);
CREATE INDEX wiki_task_link_page ON app.wiki_task_link(project_id,page_id,task_id) WHERE archived_at IS NULL;
ALTER TABLE app.wiki_page ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.wiki_page FORCE ROW LEVEL SECURITY;
CREATE POLICY wiki_page_read ON app.wiki_page FOR SELECT USING(auth.can(project_id,'tasks.read'));
CREATE POLICY wiki_page_insert ON app.wiki_page FOR INSERT WITH CHECK(auth.can(project_id,'tasks.write'));
CREATE POLICY wiki_page_update ON app.wiki_page FOR UPDATE USING(auth.can(project_id,'tasks.write'))
 WITH CHECK(auth.can(project_id,'tasks.write'));
ALTER TABLE app.wiki_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.wiki_version FORCE ROW LEVEL SECURITY;
CREATE POLICY wiki_version_read ON app.wiki_version FOR SELECT USING(auth.can(project_id,'tasks.read'));
CREATE POLICY wiki_version_insert ON app.wiki_version FOR INSERT WITH CHECK(auth.can(project_id,'tasks.write'));
-- The shared afterMigrate grants UPDATE to app tables; absent UPDATE/DELETE policies keep history immutable.
ALTER TABLE app.wiki_task_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.wiki_task_link FORCE ROW LEVEL SECURITY;
CREATE POLICY wiki_task_link_read ON app.wiki_task_link FOR SELECT USING(auth.can(project_id,'tasks.read'));
CREATE POLICY wiki_task_link_insert ON app.wiki_task_link FOR INSERT WITH CHECK(
 auth.can(project_id,'tasks.write') AND EXISTS(
  SELECT 1 FROM app.tasks t WHERE t.project_id=wiki_task_link.project_id AND t.id=wiki_task_link.task_id AND t.result='open'));
CREATE POLICY wiki_task_link_update ON app.wiki_task_link FOR UPDATE USING(auth.can(project_id,'tasks.write')) WITH CHECK(
 auth.can(project_id,'tasks.write') AND EXISTS(
  SELECT 1 FROM app.tasks t WHERE t.project_id=wiki_task_link.project_id AND t.id=wiki_task_link.task_id AND t.result='open'));

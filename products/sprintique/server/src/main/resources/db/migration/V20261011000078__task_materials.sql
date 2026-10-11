CREATE TABLE app.task_material (
 project_id text NOT NULL,
 id text NOT NULL CHECK(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 task_id text NOT NULL,
 category text NOT NULL CHECK(category IN ('design','documentation')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200 AND title=btrim(title)),
 url text NOT NULL CHECK(octet_length(url) BETWEEN 1 AND 2048 AND url ~* '^https?://' AND url !~ '[[:space:][:cntrl:]]'),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,id),
 FOREIGN KEY(project_id,task_id) REFERENCES app.tasks(project_id,id)
);
CREATE INDEX task_material_active ON app.task_material(project_id,task_id,created_at,id) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX task_material_unique_url ON app.task_material(project_id,task_id,category,url) WHERE archived_at IS NULL;
ALTER TABLE app.task_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.task_material FORCE ROW LEVEL SECURITY;
CREATE POLICY task_material_read ON app.task_material FOR SELECT USING(auth.can(project_id,'tasks.read'));
CREATE POLICY task_material_insert ON app.task_material FOR INSERT WITH CHECK(
 auth.can(project_id,'tasks.write') AND EXISTS(
  SELECT 1 FROM app.tasks t WHERE t.project_id=task_material.project_id AND t.id=task_material.task_id AND t.result='open'));
CREATE POLICY task_material_update ON app.task_material FOR UPDATE USING(auth.can(project_id,'tasks.write')) WITH CHECK(
 auth.can(project_id,'tasks.write') AND EXISTS(
  SELECT 1 FROM app.tasks t WHERE t.project_id=task_material.project_id AND t.id=task_material.task_id AND t.result='open'));

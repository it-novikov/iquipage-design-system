-- Allocate feed positions under the project row lock, so position order is commit order.
-- A global sequence allocated before commit could permanently skip a late transaction.
ALTER TABLE app.projects ADD COLUMN event_sequence bigint NOT NULL DEFAULT 0;
ALTER TABLE app.outbox ADD COLUMN project_sequence bigint;
WITH numbered AS (
  SELECT id,row_number() OVER(PARTITION BY project_id ORDER BY created_at,id) AS position FROM app.outbox
) UPDATE app.outbox SET project_sequence=numbered.position FROM numbered WHERE outbox.id=numbered.id;
UPDATE app.projects p SET event_sequence=coalesce((SELECT max(project_sequence) FROM app.outbox WHERE project_id=p.id),0);
ALTER TABLE app.outbox ALTER COLUMN project_sequence SET NOT NULL;
CREATE UNIQUE INDEX outbox_project_sequence ON app.outbox(project_id,project_sequence);
CREATE FUNCTION app.position_project_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE app.projects SET event_sequence=event_sequence+1 WHERE id=NEW.project_id RETURNING event_sequence INTO NEW.project_sequence;
  RETURN NEW;
END $$;
CREATE TRIGGER position_project_event BEFORE INSERT ON app.outbox FOR EACH ROW EXECUTE FUNCTION app.position_project_event();

CREATE TRIGGER task_links_planning_revision AFTER INSERT OR UPDATE ON app.task_links FOR EACH ROW EXECUTE FUNCTION app.bump_planning_revision();

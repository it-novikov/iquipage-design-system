-- Planning R4.1: a task's estimate as it was entered (time in hours, days or weeks, or story points) and a
-- release's goal. The project's format and hours per day and week live in app.projects.planning_defaults; changing
-- them never rewrites stored estimates.
ALTER TABLE app.tasks ADD COLUMN estimate_value numeric(8,2);
ALTER TABLE app.tasks ADD COLUMN estimate_unit text;
ALTER TABLE app.tasks ADD CONSTRAINT task_estimate CHECK(
  (estimate_value IS NULL AND estimate_unit IS NULL)
  OR (estimate_value IS NOT NULL AND estimate_value > 0 AND estimate_unit IN ('h','d','w','sp')));
ALTER TABLE app.releases ADD COLUMN goal text;
ALTER TABLE app.releases ADD CONSTRAINT release_goal CHECK(goal IS NULL OR char_length(goal) <= 240);

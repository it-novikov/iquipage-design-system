-- Finance row security reads the caller's permitted projects once per statement (docs/decisions/0009-finance-plan.md).
-- A read policy that calls auth.can(project_id, 'finance.read') runs that function for every row: on 100 000 entries
-- the plan overview spent 580 of its 600 ms there. The projects in which the caller holds a permission are computed
-- once as an InitPlan and compared as an array, with exactly the rules of auth.can: the same membership row, the same
-- service-account and agent limits, the same narrowing of an AI agent run to the person who started it.

CREATE FUNCTION auth.projects_with(permission text) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT coalesce(array_agg(m.project_id ORDER BY m.project_id), '{}') FROM app.project_members m
  WHERE m.principal_id=auth.actor_id() AND permission=ANY(m.permissions) AND auth.can(m.project_id, permission)
$$;
REVOKE ALL ON FUNCTION auth.projects_with(text) FROM PUBLIC;

DROP POLICY finance_settings_read ON app.finance_settings;
CREATE POLICY finance_settings_read ON app.finance_settings FOR SELECT
  USING(project_id=ANY((SELECT auth.projects_with('finance.read'))::text[]));
DROP POLICY finance_entry_read ON app.finance_entry;
CREATE POLICY finance_entry_read ON app.finance_entry FOR SELECT
  USING(project_id=ANY((SELECT auth.projects_with('finance.read'))::text[]));
DROP POLICY finance_entry_version_read ON app.finance_entry_version;
CREATE POLICY finance_entry_version_read ON app.finance_entry_version FOR SELECT
  USING(project_id=ANY((SELECT auth.projects_with('finance.read'))::text[]));
DROP POLICY finance_category_read ON app.finance_category;
CREATE POLICY finance_category_read ON app.finance_category FOR SELECT
  USING(project_id=ANY((SELECT auth.projects_with('finance.read'))::text[]));
DROP POLICY finance_plan_read ON app.finance_plan;
CREATE POLICY finance_plan_read ON app.finance_plan FOR SELECT
  USING(project_id=ANY((SELECT auth.projects_with('finance.read'))::text[]));
DROP POLICY finance_plan_version_read ON app.finance_plan_version;
CREATE POLICY finance_plan_version_read ON app.finance_plan_version FOR SELECT
  USING(project_id=ANY((SELECT auth.projects_with('finance.read'))::text[]));
DROP POLICY finance_plan_line_read ON app.finance_plan_line;
CREATE POLICY finance_plan_line_read ON app.finance_plan_line FOR SELECT
  USING(project_id=ANY((SELECT auth.projects_with('finance.read'))::text[]));
DROP POLICY finance_variance_note_read ON app.finance_variance_note;
CREATE POLICY finance_variance_note_read ON app.finance_variance_note FOR SELECT
  USING(project_id=ANY((SELECT auth.projects_with('finance.read'))::text[]));

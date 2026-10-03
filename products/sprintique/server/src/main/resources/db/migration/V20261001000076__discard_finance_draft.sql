-- A draft nobody wants is discarded with its lines (docs/decisions/0009-finance-plan.md); an approved or superseded
-- version never is. A plan whose only version was that draft goes with it: the foreign key of the versions keeps any
-- plan that still has one, so a plan with an approval in its history is never deleted.
CREATE OR REPLACE FUNCTION app.guard_finance_plan_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.state<>'draft' THEN
      RAISE EXCEPTION 'Only a draft finance plan version is discarded' USING ERRCODE='check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.revision<>1 OR NEW.state<>'draft' THEN
      RAISE EXCEPTION 'A finance plan version starts at revision 1 as a draft' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'A finance plan version change adds exactly one revision' USING ERRCODE='check_violation';
  END IF;
  IF (NEW.project_id,NEW.plan_id,NEW.version,NEW.created_by,NEW.created_at)
     IS DISTINCT FROM (OLD.project_id,OLD.plan_id,OLD.version,OLD.created_by,OLD.created_at) THEN
    RAISE EXCEPTION 'The identity and creation of a finance plan version are fixed' USING ERRCODE='check_violation';
  END IF;
  IF OLD.state='draft' THEN
    IF NEW.state NOT IN ('draft','approved') THEN
      RAISE EXCEPTION 'A draft finance plan version is approved, never superseded' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state='approved' AND NEW.state='superseded'
     AND (NEW.note,NEW.approved_by,NEW.approved_at) IS NOT DISTINCT FROM (OLD.note,OLD.approved_by,OLD.approved_at) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'An approved or superseded finance plan version cannot change' USING ERRCODE='check_violation';
END $$;

CREATE POLICY finance_plan_version_delete ON app.finance_plan_version FOR DELETE
  USING(auth.can(project_id,'finance.write') AND state='draft');
CREATE POLICY finance_plan_delete ON app.finance_plan FOR DELETE USING(auth.can(project_id,'finance.write'));

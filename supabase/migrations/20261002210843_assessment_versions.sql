-- New, immutable results. Existing organization_assessments stays legacy/unknown.
-- No backfill, UPDATE, score recalculation or inference of historical versions.
-- Restore a retained table when reapplying after our non-destructive rollback.
DO $$ BEGIN
  IF to_regclass('specv_rollback.assessment_results') IS NOT NULL THEN
    IF to_regclass('public.assessment_results') IS NOT NULL THEN
      RAISE EXCEPTION 'Both live and archived assessment_results exist; manual review required';
    END IF;
    ALTER TABLE specv_rollback.assessment_results SET SCHEMA public;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.assessment_results (
  assessment_id uuid PRIMARY KEY,
  token_id text NOT NULL UNIQUE REFERENCES public.tokens(id),
  measurement_version text NOT NULL CHECK (measurement_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  scoring_version text NOT NULL CHECK (scoring_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  org_id uuid REFERENCES public.organizations(id),
  department_id uuid REFERENCES public.departments(id),
  completed_at timestamptz NOT NULL,
  type_name text NOT NULL,
  axis_suishinryoku numeric NOT NULL CHECK (axis_suishinryoku BETWEEN 1 AND 7),
  axis_doku numeric NOT NULL CHECK (axis_doku BETWEEN 1 AND 7),
  axis_kaihoudu numeric NOT NULL CHECK (axis_kaihoudu BETWEEN 1 AND 7),
  axis_jikoniinti numeric NOT NULL CHECK (axis_jikoniinti BETWEEN 1 AND 7),
  axis_tamashii numeric NOT NULL CHECK (axis_tamashii BETWEEN 1 AND 7),
  axis_ai numeric NOT NULL CHECK (axis_ai BETWEEN 1 AND 7),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assessment_results_cohort_idx
  ON public.assessment_results(org_id, measurement_version, scoring_version, completed_at DESC);
CREATE INDEX IF NOT EXISTS assessment_results_department_cohort_idx
  ON public.assessment_results(org_id, department_id, measurement_version, scoring_version, completed_at DESC);
ALTER TABLE public.assessment_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assessment_results FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.assessment_results TO service_role;
DROP POLICY IF EXISTS service_role_read ON public.assessment_results;
CREATE POLICY service_role_read ON public.assessment_results FOR SELECT TO service_role USING (true);
DROP POLICY IF EXISTS service_role_insert ON public.assessment_results;
CREATE POLICY service_role_insert ON public.assessment_results FOR INSERT TO service_role WITH CHECK (true);
COMMENT ON TABLE public.assessment_results IS 'Versioned immutable 81-question aggregate results; no raw answers. Legacy data remains in organization_assessments.';

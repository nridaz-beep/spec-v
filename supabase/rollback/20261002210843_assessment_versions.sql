-- Run in a transaction after stopping new-version writes / reverting application code.
-- Keeps every result and index; no DROP TABLE or deletion. Forward migration restores it.
CREATE SCHEMA IF NOT EXISTS specv_rollback;
REVOKE ALL ON SCHEMA specv_rollback FROM PUBLIC, anon, authenticated, service_role;
DO $$ BEGIN
  IF to_regclass('public.assessment_results') IS NOT NULL THEN
    IF to_regclass('specv_rollback.assessment_results') IS NOT NULL THEN
      RAISE EXCEPTION 'Archive already exists; refusing to overwrite';
    END IF;
    ALTER TABLE public.assessment_results SET SCHEMA specv_rollback;
  END IF;
END $$;

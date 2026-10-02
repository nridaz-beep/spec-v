-- Read-only operational checks. Run after migration using an authorized DB admin.
-- Compare legacy count/content with a pre-migration backup, not with inferred versions.
SELECT count(*) AS legacy_rows FROM public.organization_assessments;
SELECT measurement_version, scoring_version, count(*) AS result_count
FROM public.assessment_results GROUP BY 1,2 ORDER BY 1,2;
SELECT count(*) AS incomplete_identity_count FROM public.assessment_results
WHERE assessment_id IS NULL OR measurement_version IS NULL OR scoring_version IS NULL;
SELECT token_id, count(*) FROM public.assessment_results GROUP BY token_id HAVING count(*) > 1;
SELECT r.relrowsecurity FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
WHERE n.nspname='public' AND r.relname='assessment_results';
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='assessment_results' ORDER BY 1,2;
SELECT policyname, roles, cmd FROM pg_policies
WHERE schemaname='public' AND tablename='assessment_results';
-- Expected: SELECT/INSERT true; UPDATE/DELETE and browser read false.
SELECT has_table_privilege('service_role','public.assessment_results','SELECT') AS service_read,
       has_table_privilege('service_role','public.assessment_results','INSERT') AS service_insert,
       has_table_privilege('service_role','public.assessment_results','UPDATE') AS service_update,
       has_table_privilege('service_role','public.assessment_results','DELETE') AS service_delete,
       has_table_privilege('anon','public.assessment_results','SELECT') AS anon_read,
       has_table_privilege('authenticated','public.assessment_results','SELECT') AS authenticated_read;
SELECT to_regclass('public.assessment_results') AS live_table,
       to_regclass('specv_rollback.assessment_results') AS archive_table;
-- Never combine legacy and current rows with UNION for production aggregate queries.

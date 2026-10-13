-- READ ONLY. Check AFTER separately approved migration; never creates objects.
BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS database_name,current_user AS role,
 current_schema() AS schema_name,to_regclass('whatsapp_customer_windows') AS app_resolution,
 to_regclass('public.whatsapp_customer_windows') AS public_resolution;
SELECT column_name,data_type,is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='whatsapp_customer_windows'
ORDER BY ordinal_position;
SELECT pg_get_constraintdef(oid) AS primary_key FROM pg_constraint
WHERE conrelid=to_regclass('public.whatsapp_customer_windows') AND contype='p';
SELECT CASE WHEN to_regclass('public.whatsapp_customer_windows') IS NOT NULL
 THEN has_table_privilege(to_regclass('public.whatsapp_customer_windows'),'SELECT') END AS can_select,
 CASE WHEN to_regclass('public.whatsapp_customer_windows') IS NOT NULL
 THEN has_table_privilege(to_regclass('public.whatsapp_customer_windows'),'INSERT') END AS can_insert,
 CASE WHEN to_regclass('public.whatsapp_customer_windows') IS NOT NULL
 THEN has_table_privilege(to_regclass('public.whatsapp_customer_windows'),'UPDATE') END AS can_update;
COMMIT;

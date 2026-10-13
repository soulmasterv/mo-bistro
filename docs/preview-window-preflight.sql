-- READ ONLY. Execute in the independently verified Neon Preview branch as the
-- application role. Database name alone does not identify the Neon branch.
BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS database_name,current_user AS role,
 current_schema() AS creation_schema,current_setting('search_path') AS search_path,
 current_schemas(true) AS effective_search_path;
SELECT to_regclass('whatsapp_customer_windows') AS app_resolution,
 to_regclass('public.whatsapp_customer_windows') AS public_resolution,
 to_regclass('public.whatsapp_preview_inbound') AS preview_inbound,
 to_regclass('public.whatsapp_preview_tests') AS preview_tests;
SELECT n.nspname AS schema_name,c.relname,c.relkind,pg_table_is_visible(c.oid) AS visible,
 has_schema_privilege(n.oid,'USAGE') AS can_use_schema
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE lower(c.relname)='whatsapp_customer_windows';
SELECT table_schema,table_name,column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_name IN ('whatsapp_customer_windows','whatsapp_preview_inbound','whatsapp_preview_tests')
ORDER BY table_schema,table_name,ordinal_position;
COMMIT;

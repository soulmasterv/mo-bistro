-- Read-only diagnostic. Select the Preview Neon branch and mo_bistro_2 first.
SELECT current_database() AS database_name, current_schema() AS schema_name,
  current_setting('search_path') AS search_path,
  to_regclass('whatsapp_preview_inbound')::text AS preview_inbound,
  to_regclass('whatsapp_preview_tests')::text AS preview_tests,
  to_regclass('whatsapp_inbound_events')::text AS customer_inbound,
  to_regclass('whatsapp_notifications')::text AS customer_notifications;
SELECT table_name,column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema=current_schema() AND table_name IN
 ('whatsapp_preview_inbound','whatsapp_preview_tests','whatsapp_inbound_events','whatsapp_notifications')
ORDER BY table_name,ordinal_position;

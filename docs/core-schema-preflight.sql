-- READ ONLY. Run only against the database chosen by the operator.
SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN ('guests','restaurant_settings','qr_registration_permits','api_rate_limits','staff_users','staff_shifts','simple_table_capacity','table_ready_requests','whatsapp_preview_inbound','whatsapp_preview_tests','whatsapp_customer_windows')
 ORDER BY table_name,ordinal_position;
SELECT key,value FROM public.restaurant_settings WHERE key IN ('queue_capacity','approval_required','require_confirmation');
SELECT COUNT(*) AS duplicate_phone_groups FROM (SELECT phone FROM public.guests WHERE status IN ('waiting','called') GROUP BY phone HAVING COUNT(*)>1) AS groups;
SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('guests','qr_registration_permits','api_rate_limits');

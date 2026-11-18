-- Apply only to the isolated Pilot database branch before switching its connection.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF to_regclass('public.pilot_parties') IS NULL THEN
    RAISE EXCEPTION 'Expected Pilot source table is missing';
  END IF;
  IF to_regnamespace('archived_advanced') IS NOT NULL THEN
    RAISE EXCEPTION 'Archive schema already exists; inspect the previous migration';
  END IF;
END $$;

CREATE SCHEMA archived_advanced;
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'guests', 'guest_booking_changes', 'guest_eta_changes', 'guest_staff_details',
    'advanced_reminder_events', 'advanced_reminder_jobs', 'advanced_table_events',
    'advanced_table_overrides', 'advanced_wait_estimates', 'booking_recovery_requests',
    'demo_queue_batch', 'demo_queue_pin_attempts', 'qr_registration_permits',
    'seating_history', 'simple_table_events', 'table_ready_requests',
    'whatsapp_booking_consents', 'whatsapp_delivery_logs', 'whatsapp_inbound_events',
    'whatsapp_notifications', 'whatsapp_preview_inbound', 'whatsapp_preview_tests'
  ] LOOP
    IF to_regclass('public.' || relation) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA archived_advanced', relation);
    END IF;
  END LOOP;
END $$;
ALTER TABLE public.pilot_parties RENAME TO guests;

-- Stored SQL bodies contain names, unlike foreign keys, so repair those explicitly.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid, p.prosrc, pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND (p.prosrc LIKE '%public.pilot_parties%' OR p.prosrc LIKE '%public.guests%')
  LOOP
    IF f.prosrc LIKE '%public.pilot_parties%' THEN
      EXECUTE replace(f.definition, 'public.pilot_parties', 'public.guests');
    ELSE
      EXECUTE replace(replace(f.definition, 'public.guests', 'archived_advanced.guests'),
        'public.demo_queue_batch', 'archived_advanced.demo_queue_batch');
    END IF;
  END LOOP;
END $$;

-- Foreign keys and table privileges follow the renamed table automatically.
COMMIT;

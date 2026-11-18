-- Apply only to the new Advanced Preview branch, never the shared source.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE SCHEMA archived_pilot;
ALTER TABLE public.pilot_parties SET SCHEMA archived_pilot;
ALTER TABLE public.pilot_ready_messages SET SCHEMA archived_pilot;
ALTER TABLE public.pilot_phone_taps SET SCHEMA archived_pilot;
ALTER TABLE public.demo_queue_pilot_batch SET SCHEMA archived_pilot;

-- Keep preserved demo helpers attached to the preserved Pilot data.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.prosrc LIKE '%public.pilot_parties%'
  LOOP
    EXECUTE replace(replace(replace(replace(f.definition,
      'public.pilot_parties', 'archived_pilot.pilot_parties'),
      'public.pilot_ready_messages', 'archived_pilot.pilot_ready_messages'),
      'public.pilot_phone_taps', 'archived_pilot.pilot_phone_taps'),
      'public.demo_queue_pilot_batch', 'archived_pilot.demo_queue_pilot_batch');
  END LOOP;
END $$;
COMMIT;

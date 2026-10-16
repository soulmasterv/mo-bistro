-- Normalize audit snapshots written by the initial staff editor's JSON cast.
-- No history records are deleted; malformed snapshots abort the transaction.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
UPDATE public.guest_booking_changes
  SET before_values=(before_values #>> '{}')::jsonb
  WHERE jsonb_typeof(before_values)='string';
UPDATE public.guest_booking_changes
  SET after_values=(after_values #>> '{}')::jsonb
  WHERE jsonb_typeof(after_values)='string';
ALTER TABLE public.guest_booking_changes ADD CONSTRAINT guest_booking_changes_snapshot_objects
  CHECK (jsonb_typeof(before_values)='object' AND jsonb_typeof(after_values)='object');
COMMIT;

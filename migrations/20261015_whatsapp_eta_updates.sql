-- Review on fresh isolated QA first. No migration is run by the application.
BEGIN;
ALTER TABLE public.whatsapp_notifications DROP CONSTRAINT whatsapp_notifications_kind_check;
ALTER TABLE public.whatsapp_notifications ADD CONSTRAINT whatsapp_notifications_kind_check
  CHECK(kind IN ('confirmation','almost_ready','review','eta_update'));
ALTER TABLE public.whatsapp_notifications ADD COLUMN event_key UUID;
ALTER TABLE public.whatsapp_notifications ADD COLUMN eta_snapshot_at TIMESTAMPTZ;
ALTER TABLE public.whatsapp_notifications ADD CONSTRAINT eta_update_has_snapshot
  CHECK(kind <> 'eta_update' OR (event_key IS NOT NULL AND eta_snapshot_at IS NOT NULL));
-- Confirmation/review keep one job per booking. ETA updates and Almost Ready
-- use immutable event/job IDs so delivery callbacks cannot affect a later ETA.
ALTER TABLE public.whatsapp_notifications DROP CONSTRAINT whatsapp_notifications_guest_id_kind_key;
CREATE UNIQUE INDEX whatsapp_notifications_booking_kind ON public.whatsapp_notifications(guest_id,kind)
  WHERE kind NOT IN ('eta_update','almost_ready');
CREATE UNIQUE INDEX whatsapp_notifications_event_key ON public.whatsapp_notifications(event_key)
  WHERE event_key IS NOT NULL;
CREATE TABLE public.guest_eta_changes (
  request_id UUID PRIMARY KEY,
  guest_id INTEGER NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  minutes INTEGER CHECK(minutes BETWEEN 1 AND 240),
  eta_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX guest_eta_changes_booking ON public.guest_eta_changes(guest_id);
COMMIT;

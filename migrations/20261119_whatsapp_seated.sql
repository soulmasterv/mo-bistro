-- Advanced only. Apply before deploying seated-message support.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.whatsapp_notifications DROP CONSTRAINT whatsapp_notifications_kind_check;
ALTER TABLE public.whatsapp_notifications ADD CONSTRAINT whatsapp_notifications_kind_check
  CHECK(kind IN ('confirmation','almost_ready','review','eta_update','seated'));
-- Existing per-booking uniqueness also covers the new seated kind.
COMMIT;

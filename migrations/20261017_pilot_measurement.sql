BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.pilot_parties DROP CONSTRAINT pilot_parties_exit_reason_check;
ALTER TABLE public.pilot_parties DROP CONSTRAINT pilot_parties_pending_exit_kind_check;
ALTER TABLE public.pilot_parties ADD CONSTRAINT pilot_exit_reason CHECK(exit_reason IN
 ('no_show_after_call','cancelled_before_call','guest_cancelled','left_unannounced','no_response','duplicate_test'));
ALTER TABLE public.pilot_parties ADD CONSTRAINT pilot_pending_reason CHECK(pending_exit_kind IN
 ('no_show','cancel','guest_cancelled','left_unannounced','no_response','duplicate_test'));
ALTER TABLE public.pilot_parties
 ADD COLUMN exit_state TEXT CHECK(exit_state IN ('waiting','called')),
 ADD COLUMN informed_via TEXT CHECK(informed_via IN ('whatsapp_accepted','staff_confirmed')),
 ADD COLUMN phone_call_taps INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN last_phone_call_at TIMESTAMPTZ,
 ADD COLUMN whatsapp_inbound_after_opt_in_at TIMESTAMPTZ;
ALTER TABLE public.pilot_ready_messages DROP CONSTRAINT pilot_ready_messages_party_id_key;
CREATE INDEX pilot_messages_party ON public.pilot_ready_messages(party_id,created_at DESC,id);
CREATE UNIQUE INDEX pilot_one_pending_send ON public.pilot_ready_messages(party_id)
 WHERE status IN ('pending','scheduled','sending');
CREATE TABLE public.pilot_phone_taps (
 id UUID PRIMARY KEY,party_id INTEGER NOT NULL REFERENCES public.pilot_parties(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
-- Repair the old optimistic state only for parties still in the active queue.
UPDATE public.pilot_ready_messages SET status='unknown'
 WHERE status='failed' AND last_error='scheduler_callback_missing';
UPDATE public.pilot_parties p SET status='waiting',called_at=NULL
 WHERE p.status='called' AND EXISTS(SELECT 1 FROM public.pilot_ready_messages m WHERE m.party_id=p.id AND m.status<>'sent');
UPDATE public.pilot_parties p SET informed_via='whatsapp_accepted'
 WHERE p.called_at IS NOT NULL AND EXISTS(SELECT 1 FROM public.pilot_ready_messages m WHERE m.party_id=p.id AND m.status='sent');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mo_bistro_app') THEN
  GRANT SELECT,INSERT ON public.pilot_phone_taps TO mo_bistro_app;
 END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.pilot_parties
 ADD COLUMN exit_reason TEXT CHECK(exit_reason IN ('no_show_after_call','cancelled_before_call')),
 ADD COLUMN pending_exit_kind TEXT CHECK(pending_exit_kind IN ('no_show','cancel')),
 ADD COLUMN pending_exit_at TIMESTAMPTZ,
 ADD COLUMN pending_exit_token UUID,
 ADD CONSTRAINT pilot_pending_exit_complete CHECK(
  (pending_exit_kind IS NULL AND pending_exit_at IS NULL AND pending_exit_token IS NULL) OR
  (pending_exit_kind IS NOT NULL AND pending_exit_at IS NOT NULL AND pending_exit_token IS NOT NULL AND status IN ('waiting','called'))
 );
CREATE INDEX pilot_pending_exits ON public.pilot_parties(pending_exit_at) WHERE pending_exit_at IS NOT NULL;
COMMIT;

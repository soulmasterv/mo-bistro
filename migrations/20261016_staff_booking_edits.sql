-- Apply only after target verification and explicit environment approval.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE public.guest_staff_details (
  guest_id INTEGER PRIMARY KEY REFERENCES public.guests(id) ON DELETE CASCADE,
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);
CREATE TABLE public.guest_booking_changes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guest_id INTEGER NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES public.staff_users(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  before_values JSONB NOT NULL,
  after_values JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX guest_booking_changes_guest ON public.guest_booking_changes(guest_id,id DESC);
COMMIT;

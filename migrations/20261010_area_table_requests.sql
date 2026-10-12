BEGIN;

-- This migration sorts before table_ready_requests; create its prerequisites first.
CREATE TABLE IF NOT EXISTS public.table_ready_requests (
  id BIGSERIAL PRIMARY KEY,
  table_id INTEGER NOT NULL REFERENCES public.restaurant_tables(id),
  requested_by INTEGER NOT NULL REFERENCES public.staff_users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by INTEGER REFERENCES public.staff_users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS table_ready_requests_one_pending_per_table ON public.table_ready_requests(table_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS table_ready_requests_pending_idx ON public.table_ready_requests(requested_at DESC) WHERE status='pending';
ALTER TABLE public.staff_users DROP CONSTRAINT IF EXISTS staff_users_role_check;
ALTER TABLE public.staff_users ADD CONSTRAINT staff_users_role_check CHECK (role IN ('manager','reception','waiter'));


ALTER TABLE public.table_ready_requests
  ADD COLUMN IF NOT EXISTS area TEXT;

ALTER TABLE public.table_ready_requests
  ALTER COLUMN table_id DROP NOT NULL;

ALTER TABLE public.table_ready_requests
  DROP CONSTRAINT IF EXISTS table_ready_requests_area_check;

ALTER TABLE public.table_ready_requests
  ADD CONSTRAINT table_ready_requests_area_check
  CHECK (area IS NULL OR area IN ('indoor', 'outdoor'));

ALTER TABLE public.table_ready_requests
  DROP CONSTRAINT IF EXISTS table_ready_requests_target_check;

ALTER TABLE public.table_ready_requests
  ADD CONSTRAINT table_ready_requests_target_check
  CHECK (
    (table_id IS NOT NULL AND area IS NULL)
    OR
    (table_id IS NULL AND area IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS table_ready_requests_pending_area_idx
  ON public.table_ready_requests(area, requested_at)
  WHERE status = 'pending' AND area IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS table_ready_requests_one_pending_per_area_staff
  ON public.table_ready_requests(area, requested_by)
  WHERE status = 'pending' AND area IS NOT NULL;

COMMIT;

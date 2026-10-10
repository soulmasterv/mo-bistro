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

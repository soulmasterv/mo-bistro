BEGIN;

ALTER TABLE public.staff_users
  ADD COLUMN IF NOT EXISTS pin_hash TEXT;

ALTER TABLE public.staff_users
  DROP CONSTRAINT IF EXISTS staff_users_role_check;

ALTER TABLE public.staff_users
  ADD CONSTRAINT staff_users_role_check
  CHECK (role IN ('manager', 'reception', 'waiter'));

COMMIT;

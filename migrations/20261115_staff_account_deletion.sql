ALTER TABLE public.staff_users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

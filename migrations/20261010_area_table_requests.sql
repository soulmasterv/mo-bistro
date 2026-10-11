BEGIN;

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

COMMIT;

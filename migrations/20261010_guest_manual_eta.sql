-- Optional Reception-assigned ETA deadline for each guest.
-- Existing guests retain NULL until Reception assigns an ETA.
BEGIN;

ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS eta_at TIMESTAMPTZ;

COMMIT;

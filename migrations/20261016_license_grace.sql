-- Prepared only. Review/apply to the intended Preview database separately.
-- No existing license is reactivated and no existing suspension gains grace.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.restaurant_license
  ADD COLUMN suspension_due_at TIMESTAMPTZ,
  ADD COLUMN license_revision BIGINT NOT NULL DEFAULT 0 CHECK (license_revision >= 0);
ALTER TABLE public.license_audit_log ADD COLUMN details JSONB NOT NULL DEFAULT '{}';
COMMIT;

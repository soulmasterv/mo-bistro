-- Forward migration. Review/apply ONLY to an approved isolated environment first.
-- No credentials, customer opt-ins or historical seating timestamps are backfilled.
BEGIN;
CREATE TABLE IF NOT EXISTS public.qr_registration_permits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  qr_code_hash TEXT NOT NULL CHECK (qr_code_hash ~ '^[a-f0-9]{64}$'),
  qr_expires_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at TIMESTAMPTZ,
  CHECK (expires_at >= qr_expires_at)
);
CREATE INDEX IF NOT EXISTS qr_registration_permits_expiry ON public.qr_registration_permits(expires_at);
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key_hash TEXT PRIMARY KEY CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  request_count INTEGER NOT NULL CHECK (request_count >= 1),
  window_start BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS api_rate_limits_expiry ON public.api_rate_limits(expires_at);
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS seated_at TIMESTAMPTZ;
COMMIT;

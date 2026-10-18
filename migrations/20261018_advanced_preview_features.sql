-- Advanced Preview only. Validate on an isolated Neon branch before shared DB.
-- Additive: no existing records are updated, removed or backfilled.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE TABLE public.advanced_wait_estimates (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 notification_id UUID UNIQUE REFERENCES public.whatsapp_notifications(id) ON DELETE SET NULL,
 guest_id INTEGER REFERENCES public.guests(id) ON DELETE SET NULL,
 party_size INTEGER NOT NULL,
 preference TEXT NOT NULL CHECK(preference IN ('indoor','outdoor','any')),
 sample_count INTEGER NOT NULL CHECK(sample_count>=0),
 median_minutes DOUBLE PRECISION,
 low_minutes INTEGER,
 high_minutes INTEGER,
 estimate_copy TEXT,
 reason TEXT NOT NULL,
 calculation_version TEXT NOT NULL DEFAULT 'median-same-size-preference-v1',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 accepted_at TIMESTAMPTZ,
 CHECK((low_minutes IS NULL AND high_minutes IS NULL) OR (low_minutes>=0 AND high_minutes>=low_minutes))
);

CREATE TABLE public.advanced_reminder_jobs (
 id UUID PRIMARY KEY,
 guest_id INTEGER NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('timer','next')),
 due_at TIMESTAMPTZ NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','simulated','skipped','failed','unknown')),
 reason TEXT,
 provider_message_id TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 qstash_message_id TEXT,
 publish_lease_until TIMESTAMPTZ,
 publish_retry_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(guest_id,kind)
);
CREATE INDEX advanced_reminder_due ON public.advanced_reminder_jobs(status,due_at);
CREATE TABLE public.advanced_reminder_events (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job_id UUID NOT NULL REFERENCES public.advanced_reminder_jobs(id) ON DELETE CASCADE,
 state TEXT NOT NULL,
 reason TEXT,
 provider_message_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.advanced_table_overrides (
 area TEXT PRIMARY KEY CHECK(area IN ('indoor','outdoor')),
 available_count INTEGER NOT NULL CHECK(available_count BETWEEN 0 AND 500),
 revision INTEGER NOT NULL DEFAULT 0,
 actor_staff_id INTEGER NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE public.advanced_table_events (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 table_id INTEGER,
 area TEXT,
 action TEXT NOT NULL CHECK(action IN ('add','edit','archive','override')),
 actor_staff_id INTEGER NOT NULL,
 actor_username TEXT NOT NULL,
 before_value JSONB,
 after_value JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.restaurant_tables
 ADD COLUMN advanced_archived_at TIMESTAMPTZ,
 ADD COLUMN advanced_revision INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mo_bistro_app') THEN
  GRANT SELECT,INSERT,UPDATE ON public.advanced_wait_estimates,public.advanced_reminder_jobs,public.advanced_table_overrides TO mo_bistro_app;
  GRANT SELECT,INSERT ON public.advanced_reminder_events,public.advanced_table_events TO mo_bistro_app;
  GRANT USAGE,SELECT ON SEQUENCE public.advanced_wait_estimates_id_seq,public.advanced_reminder_events_id_seq,public.advanced_table_events_id_seq TO mo_bistro_app;
 END IF;
END $$;
COMMIT;

-- Pilot-only tables. Existing platform records and schemas remain untouched.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE public.pilot_parties (
 id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name TEXT NOT NULL CHECK(char_length(name) BETWEEN 2 AND 100),
 phone TEXT NOT NULL,
 party_size INTEGER NOT NULL CHECK(party_size BETWEEN 1 AND 30),
 preference TEXT NOT NULL CHECK(preference IN ('indoor','outdoor')),
 source TEXT NOT NULL CHECK(source IN ('qr','walk_in')),
 status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','called','seated','left')),
 tracking_hash TEXT NOT NULL UNIQUE,
 whatsapp_consent_at TIMESTAMPTZ,
 joined_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 called_at TIMESTAMPTZ,
 seated_at TIMESTAMPTZ,
 left_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX pilot_one_active_phone ON public.pilot_parties(phone) WHERE status IN ('waiting','called');
CREATE INDEX pilot_arrival_order ON public.pilot_parties(joined_at,id);
CREATE TABLE public.pilot_ready_messages (
 id UUID PRIMARY KEY,
 party_id INTEGER NOT NULL UNIQUE REFERENCES public.pilot_parties(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','scheduled','sending','sent','failed','unknown','skipped','simulated')),
 attempts INTEGER NOT NULL DEFAULT 0,
 qstash_message_id TEXT,
 provider_message_id TEXT,
 last_error TEXT,
 publish_lease_until TIMESTAMPTZ,
 publish_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mo_bistro_app') THEN
  GRANT SELECT,INSERT,UPDATE ON public.pilot_parties,public.pilot_ready_messages TO mo_bistro_app;
  GRANT USAGE,SELECT ON SEQUENCE public.pilot_parties_id_seq TO mo_bistro_app;
 END IF;
END $$;
COMMIT;

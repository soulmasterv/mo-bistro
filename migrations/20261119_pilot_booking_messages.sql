-- Pilot only. Apply after the guests-table standardization, before deployment.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.guests ADD COLUMN whatsapp_seated_consent_at TIMESTAMPTZ;
CREATE TABLE public.pilot_booking_messages (
 id UUID PRIMARY KEY,
 party_id INTEGER NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('subscription','seated')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','simulated','skipped','failed','unknown')),
 provider_message_id TEXT,
 last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(party_id,kind)
);
CREATE INDEX pilot_booking_messages_pending ON public.pilot_booking_messages(status,created_at);
-- Give the new outbox the same DML grantees as the existing Pilot sender table.
DO $$ DECLARE permission RECORD; BEGIN
 FOR permission IN SELECT DISTINCT grantee,privilege_type FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='pilot_ready_messages'
    AND privilege_type IN ('SELECT','INSERT','UPDATE') AND grantee<>'PUBLIC'
 LOOP
  EXECUTE format('GRANT %s ON public.pilot_booking_messages TO %I',permission.privilege_type,permission.grantee);
 END LOOP;
END $$;
COMMIT;

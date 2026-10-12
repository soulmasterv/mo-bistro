-- Apply manually to an isolated Neon branch first. No runtime schema creation.
BEGIN;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS seated_at TIMESTAMPTZ;
CREATE TABLE whatsapp_booking_consents (
  guest_id INTEGER PRIMARY KEY REFERENCES guests(id) ON DELETE CASCADE,
  phone TEXT NOT NULL CHECK (phone ~ '^[1-9][0-9]{7,14}$'),
  confirmation_consent BOOLEAN NOT NULL DEFAULT FALSE,
  feedback_consent BOOLEAN NOT NULL DEFAULT FALSE,
  consent_version TEXT NOT NULL,
  consent_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  subscription_token_hash TEXT NOT NULL,
  subscription_expires_at TIMESTAMPTZ NOT NULL,
  subscribed_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  subscribed_message_id TEXT
);
CREATE INDEX whatsapp_booking_phone_idx ON whatsapp_booking_consents(phone);
CREATE TABLE whatsapp_contact_preferences (
  phone TEXT PRIMARY KEY,
  opted_out_at TIMESTAMPTZ
);
CREATE TABLE whatsapp_notifications (
  id UUID PRIMARY KEY,
  guest_id INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('confirmation','almost_ready','review')),
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK
    (status IN ('pending','scheduled','sending','sent','simulated','skipped','failed','unknown')),
  revision INTEGER NOT NULL DEFAULT 1,
  attempts INTEGER NOT NULL DEFAULT 0,
  qstash_message_id TEXT,
  publish_lease_until TIMESTAMPTZ,
  provider_message_id TEXT UNIQUE,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guest_id, kind)
);
CREATE INDEX whatsapp_notifications_outbox_idx ON whatsapp_notifications(status,due_at);
CREATE TABLE whatsapp_delivery_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  notification_id UUID REFERENCES whatsapp_notifications(id) ON DELETE CASCADE,
  event_key TEXT UNIQUE NOT NULL,
  event TEXT NOT NULL,
  provider_message_id TEXT,
  provider_timestamp BIGINT,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE whatsapp_inbound_events (
  message_id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;

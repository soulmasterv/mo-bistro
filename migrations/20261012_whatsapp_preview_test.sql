-- Apply only to isolated Preview. Never apply to Production for this test.
CREATE TABLE IF NOT EXISTS whatsapp_preview_inbound (
  message_id text PRIMARY KEY, phone text NOT NULL, phone_number_id text NOT NULL,
  provider_timestamp timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS whatsapp_preview_inbound_window ON whatsapp_preview_inbound(phone,phone_number_id,provider_timestamp DESC);
CREATE TABLE IF NOT EXISTS whatsapp_preview_tests (
  id uuid PRIMARY KEY, phone text NOT NULL, phone_number_id text NOT NULL,
  state text NOT NULL, provider_status integer, provider_message_id text UNIQUE,
  delivery_status text, delivery_timestamp bigint, created_at timestamptz NOT NULL DEFAULT NOW()
);

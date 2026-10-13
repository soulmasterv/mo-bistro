-- Apply only after approval to an isolated Preview database first. Never applied at runtime.
CREATE TABLE IF NOT EXISTS whatsapp_customer_windows (
 phone text NOT NULL, phone_number_id text NOT NULL,
 last_inbound_at timestamptz NOT NULL,
 PRIMARY KEY (phone,phone_number_id)
);

# Preview WhatsApp webhook 503 investigation

## Confirmed evidence
- Current local branch: feature/mo-bistro-ui-rebuild. HEAD and remote branch at inspection: 8507e4964b752624c7127e1c729749e531aa313b.
- The initial isolated test was committed as 238df31; the plain-text test and Preview-only migration were committed as 91375a79391786ccbb65f0d8f526b93fce06c314 and pushed previously.
- 91375a7 is an ancestor of the current remote branch. Comparing its sender, transport, webhook processing, test endpoint and migration with HEAD produced no differences. The implementation was not lost or overwritten by UI integration.
- migrations/20261012_whatsapp_preview_test.sql, src/lib/whatsapp/preview-test.ts, src/app/api/whatsapp/test/route.ts, src/components/whatsapp-preview-test.tsx and their webhook integrations are present.
- Read-only GET https://preview.mo-bistro.labbing.space/api/whatsapp/config returned HTTP 200 with available=true. At inspection the deployed app has WHATSAPP_ENABLED=true and MO_BISTRO_DB=postgres, ruling out the disabled-integration 503 branch for that configuration.
- Supplied access logs show five Meta POST 503 entries on Oct 13 around 07:04:26–07:04:33. They do not contain a response body or SQL error.

## Failure mechanism and reproduction
POST returns 503 either as Disabled before signature verification, or as Webhook processing unavailable when processMetaWebhook throws. Valid signature processing first validates the business phone number.

When the isolated Preview test is enabled, inbound from WHATSAPP_TEST_RECIPIENT calls recordPreviewInbound, which INSERTs into whatsapp_preview_inbound before normal customer event processing. Delivery callbacks call recordPreviewDelivery, which UPDATEs whatsapp_preview_tests. This lookup also runs for delivery callbacks that ultimately do not belong to the test.

If either required relation is absent, PostgreSQL raises 42P01; the route catches the error and returns Webhook processing unavailable with HTTP 503. Older whatsapp_inbound_events/whatsapp_delivery_logs tables do not substitute for these two dedicated tables: they lack the isolated inbound business-number/provider-timestamp association and isolated test attempt records.

Both missing-relation paths were reproduced offline with the actual handlers and synthetic, correctly signed payloads. Mocked SQL failures produce 503, and existing mocked relations produce 200. No database, provider or outbox was used. Invalid signatures still produce 401.

Other processing failures can also produce 503: wrong/missing MO_BISTRO_POSTGRES_URL, connectivity, invalid WHATSAPP_TEST_RECIPIENT, missing customer WhatsApp schema, unexpected columns or insufficient SQL privileges. META_APP_SECRET/signature failures are 401, not this processing 503.

## Exact live cause: not yet verified
Missing Preview test relations are the leading source-supported explanation, not a verified live database finding. No read-only Preview database connection or authenticated function-error logs are available in this workspace. The supplied status entries cannot establish which SQL relation/error actually failed. mo_bistro_2 is the target database name supplied by the user, not a database identity independently verified in this investigation.

Use docs/whatsapp-preview-schema-check.sql for read-only checks in the verified Preview Neon branch. A NULL preview_inbound or preview_tests confirms a missing relation in the active search_path. Inspect the returned columns if both relations exist. Check MO_BISTRO_POSTGRES_URL: in PostgreSQL mode the app reads that variable, not DATABASE_URL.

## Required migration, only if Preview schema check confirms it is missing
Use migrations/20261012_whatsapp_preview_test.sql. It adds two independent tables plus one index, without altering customer WhatsApp tables. UUID IDs are generated in the application; no extension or new guest column is required. Both the incoming handler and Management test depend on this migration.

```sql
CREATE TABLE IF NOT EXISTS whatsapp_preview_inbound (
  message_id text PRIMARY KEY,
  phone text NOT NULL,
  phone_number_id text NOT NULL,
  provider_timestamp timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS whatsapp_preview_inbound_window
  ON whatsapp_preview_inbound(phone,phone_number_id,provider_timestamp DESC);
CREATE TABLE IF NOT EXISTS whatsapp_preview_tests (
  id uuid PRIMARY KEY,
  phone text NOT NULL,
  phone_number_id text NOT NULL,
  state text NOT NULL,
  provider_status integer,
  provider_message_id text UNIQUE,
  delivery_status text,
  delivery_timestamp bigint,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
```

This SQL was not run. Do not apply it to Production or blindly rerun the older customer WhatsApp migration, whose CREATE TABLE statements are not all guarded against existing objects. Existing wrong-shaped tables need inspection; IF NOT EXISTS does not repair their columns.

## Local changes and validation
- Added bounded, server-only webhook diagnostics: disabled configuration booleans or a five-character database error code. Never log raw SQL/error text, message payloads, phone numbers, tokens or connection strings. Response bodies and signature verification remain unchanged.
- Added five handler regression tests covering both missing tables, success, disabled configuration and invalid signature.
- Added the read-only schema check and this report.
- 18 mock-only webhook/test safety checks passed; TypeScript/optimized build and changed-file lint passed.
- Unfinished neutral-theme, menu internal-scroll and next-guest UI changes were preserved separately in the working tree. No restoration or replacement of newer UI files was necessary.
- WHATSAPP_MODE=test and WHATSAPP_ALLOW_LIVE_SEND=false were retained for build validation. No deployed settings, database, migration, provider request, deployment, Production or main changes were made.

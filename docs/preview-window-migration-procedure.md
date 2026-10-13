# Missing WhatsApp customer-window table: proposed Preview procedure

Prepared 13 October 2026. **Not executed.** Production is excluded. Historical migrations remain unchanged.

## Why this migration is required

Operator read-only evidence confirms Preview database `mo_bistro_2`, public schema, the two isolated test tables present, and `whatsapp_customer_windows` absent. Previously inspected Vercel Preview deployment `e2803f111d0bfecf17ed40782e1a3d6e74c00ce4` already calls `recordCustomerWindow` before `recordPreviewInbound`. Its exact source and local source match for these files. Current Preview settings were observed as `WHATSAPP_WINDOW_TEXT_ENABLED=true`, `WHATSAPP_MODE=test`, and `WHATSAPP_ALLOW_LIVE_SEND=false` during the preceding investigation.

The window recorder inserts into this missing table before a configured test recipient can short-circuit customer handling. This matches the observed synchronous POST 503/42P01. Logs do not disclose the exact relation or database; verifying the deployment connection remains required. The table is independently defined by `migrations/20261013_whatsapp_customer_windows.sql`, already present in the deployed commit. Do not recreate the two test tables or rerun the non-idempotent full notification migration.

## Preflight: read only

1. Independently identify the Neon **Preview branch/endpoint**, then `mo_bistro_2`. Match its endpoint hostname and database path to the active deployment's Preview-scoped **MO_BISTRO_POSTGRES_URL**. Do not use DATABASE_URL as proof; the PostgreSQL connector reads MO_BISTRO_POSTGRES_URL. Do not expose passwords/full URLs.
2. Run `docs/preview-window-preflight.sql` as the app role. Expect database mo_bistro_2, creation schema public, two test relations present, window relation absent, and no compatible same-named table in another schema.
3. **Stop** for a different endpoint/database, alternate-schema table, quoted-case variant, incompatible existing definition, unknown ownership/privileges, or any proposal requiring destructive changes. Investigate instead of creating a duplicate or dropping data.
4. Record preflight time and the verified branch/endpoint. Existing test-table creation timestamps are unknown; PostgreSQL catalogs and row timestamps cannot prove migration application time.

## Application: separate approval required

Only after explicit approval, run the existing migration on that verified Preview database, with current_schema() confirmed public:

```sql
CREATE TABLE IF NOT EXISTS whatsapp_customer_windows (
 phone text NOT NULL, phone_number_id text NOT NULL,
 last_inbound_at timestamptz NOT NULL,
 PRIMARY KEY (phone,phone_number_id)
);
```

An operator can explicitly qualify the same definition as `public.whatsapp_customer_windows` to prevent creation in a user schema. This is a single atomic DDL statement. It adds no rows and does not alter bookings, existing tables, consent, customer opt-outs, timestamps or outbound settings. IF NOT EXISTS does not repair an incompatible existing table.

The application needs SELECT/INSERT/UPDATE access. If approval involves a different table-owning role, review and obtain approval for any required narrow grants separately; do not broaden permissions speculatively.

## Postflight: read only

Run `docs/preview-window-postflight.sql` as the app role. Require:

- Both relation resolutions identify public.whatsapp_customer_windows.
- Exactly three NOT NULL columns: phone TEXT, phone_number_id TEXT, last_inbound_at TIMESTAMPTZ.
- PRIMARY KEY (phone, phone_number_id).
- App role SELECT, INSERT and UPDATE privileges are true.

No code deployment is required for this table-only fix if the existing deployment already has the enabled flag and correct connection. Keep test/false safety flags. Do not invoke the test sender, dispatcher or webhook replay. A later separately approved inbound check should verify signature handling, business/recipient association and timestamp recording; a 200 by itself is insufficient.

If postflight fails, stop. Do not automatically drop the table, delete rows or restore a whole database. Once inbound rows exist, dropping it loses window evidence. Any correction/rollback must be reviewed independently.

Separately compare `20261013_core_support.sql` and existing ETA/PIN/shifts/request support against actual Preview metadata before deploying stabilization. The missing window table is not proof that every other migration is required.

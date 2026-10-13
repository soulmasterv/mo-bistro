# Approved disposable PostgreSQL concurrency verification

**Harness prepared, not run against PostgreSQL.** This plan authorizes no database writes. Do not use Preview mo_bistro_2 or Production.

The executable is `tests/isolated-postgres-concurrency.test.mjs`. It runs actual production booking/seating helpers and queue/Management handlers against the postgres driver, while authentication/license/provider boundaries are synthetic. Provider sending and consent writes are stubbed off. It is a database locking test, not a real login/WhatsApp-delivery test.

## Preconditions and execution after separate approval

1. Operator creates/approves a **completely empty disposable database** named `mo_bistro_qa_*` and verifies its host/endpoint. It must contain no non-system relations (including sequences), routines, custom composite/domain/enum types, or extra user schemas. Do not manually apply migrations first. Approval and connection credentials are obtained separately.
2. Keep a secure local JSON file outside the repository, or the ignored `isolated-postgres.local.json`. Never commit it or paste its URL into a report. Structure:

```json
{
  "url": "postgresql://<approved credentials>@<verified host>/mo_bistro_qa_disposable",
  "databaseName": "mo_bistro_qa_disposable",
  "host": "<verified host>",
  "ack": "I_APPROVE_SYNTHETIC_SCHEMA_WRITES"
}
```

Remote targets require TLS with certificate/hostname validation. `"ssl": false` is accepted only for loopback/local PostgreSQL. URL credentials and host are explicit; query overrides are refused except sslmode=require/verify-full. The driver is constructed from validated options, so PG* environment defaults and URL parameters cannot select another database/host/password/search path. No app environment-variable changes are needed:

Use a **direct** PostgreSQL endpoint. Neon `-pooler` hosts are refused because bootstrap relies on a persistent session advisory lock; transaction pooling cannot preserve that session. In Neon's Connect dialog, turn Connection pooling off for the QA connection string. [Neon pooling documentation](https://neon.com/docs/connect/connection-pooling).

```text
node tests/isolated-postgres-concurrency.test.mjs --config /absolute/secure/path/isolated-postgres.local.json
```

The legacy dedicated URL/ack variables remain readable if already configured. Application/Production URLs are never used as fallback. The target gate refuses mo_bistro_2, main app URL matches (including pooled-host aliases), absent approval, name/host mismatch or insecure remote targets **before any SQL**. A reserved connection verifies database, role, public-only search path, writable-primary state and backend identity before DDL. A session advisory lock serializes bootstrap; emptiness is checked while holding it. Each migration rechecks the same backend identity. Timeouts bound database/lock waits.

## Migration-backed initialization

The harness applies these **unmodified files** in the README order to the approved QA database's public schema:

1. `migrations/001_postgres_schema.sql`
2. `migrations/002_licensing.sql`
3. `migrations/20261010_guest_manual_eta.sql`
4. `migrations/20261012_staff_schema_repair.sql`
5. `migrations/20261012_simple_inventory.sql`
6. `migrations/20261013_core_support.sql`

No replacement table DDL or generated schema is used. Optional WhatsApp migrations are excluded because sending/consent boundaries are stubbed off in these core concurrency tests. Migration failures stop initialization, report the file and bounded PostgreSQL code, and roll back the failing script's transaction where possible. Previously committed migrations remain for inspection.

Synthetic fixture inserts follow migration completion. Returned actor/table IDs are used, and the migration-created Indoor/Outdoor pools are updated rather than inserted again. No real customer data or live license/credentials are copied. Authentication and license boundaries remain synthetic; this does not prove live sign-in/license enforcement.

**The harness never drops a schema or database during cleanup.** It closes connections and retains the migrated schema and synthetic rows, including on failure. A second run against that populated database deliberately fails the empty-database gate. Use a newly approved empty QA database for another full run; independently review any disposal/reset. Do not manually delete data to bypass the guard.

## Implemented executable cases

| Case | Required assertion |
|---|---|
| Connection isolation | At least two distinct backend PIDs execute overlapping transactions. |
| Queue capacity | Twelve mixed public/staff creations at capacity two yield two inserts and ten full responses. |
| Duplicate phone | Six simultaneous creations produce one active booking and five duplicate responses. |
| QR permit | Failed guest INSERT rolls permit use back; two concurrent uses produce one booking and one expired response. |
| Capacity editing | Actual Management update races with two creation transactions; final count respects the new upper bound. |
| Named table collision | Two guests race for one table; exactly one succeeds, loser is a WorkflowError, truthful seated_at exists. |
| Guest collision | One guest races for two tables; one succeeds and exactly one table is occupied. |
| Queue mutations | Cancel versus seat preserves matching occupancy; call versus cancel ends cancelled without unexpected response codes. |
| Duplicate release | Only one named release succeeds; original seated_at remains unchanged. |
| Simple inventory | Capacity one accepts one guest; duplicate release operation is idempotent and occupancy remains zero. |

Repeat on freshly approved empty QA databases after a successful run to capture varying interleavings. Record backend count, durations, expected conflicts, failures/timeouts and connection-close outcome without connection strings or customer data. Do not call skipped cases PASS.

## Additional readiness gates, not claimed covered by this harness

- The fresh-install sequence is now part of this harness but is NOT YET executed against real PostgreSQL. An upgrade from a representative older schema requires a separate approved test and is not accepted by this empty-database harness.
- Expired/rotating QR boundaries, actual rate-limit concurrency, malformed/schema/error classifications and whole-transaction failure injection.
- Mode switch versus seating, request approvals/rejections, multi-area requests and credential revocation under real sessions.
- Controlled sustained load and database outages; real browsers/devices; notification callbacks with approved isolated provider stubs.

Report these separately as BLOCKED/NOT TESTED until executed. Stop on any migration incompatibility or risk to existing data.

Offline checks in `tests/isolated-postgres-migrations.test.mjs` cover mock bootstrap refusals, sequence order/error handling, and the unmodified migrations plus fixtures/serial seating in empty in-memory PGlite. They do not connect to PostgreSQL or prove advisory locks/concurrency. Syntax, TypeScript and lint are independent local checks.

# Approved disposable PostgreSQL concurrency verification

**Harness prepared, not run against PostgreSQL.** This plan authorizes no database writes. Do not use Preview mo_bistro_2 or Production.

The executable is `tests/isolated-postgres-concurrency.test.mjs`. It runs actual production booking/seating helpers and queue/Management handlers against the postgres driver, while authentication/license/provider boundaries are synthetic. Provider sending and consent writes are stubbed off. It is a database locking test, not a real login/WhatsApp-delivery test.

## Preconditions and execution after separate approval

1. Operator creates/approves an **empty disposable database** named `mo_bistro_qa_*` and verifies its host/endpoint. It must contain no existing application tables/views in any non-system schema. Approval and connection credentials are obtained separately.
2. Keep a secure local JSON file outside the repository, or the ignored `isolated-postgres.local.json`. Never commit it or paste its URL into a report. Structure:

```json
{
  "url": "postgresql://<approved credentials>@<verified host>/mo_bistro_qa_disposable",
  "databaseName": "mo_bistro_qa_disposable",
  "host": "<verified host>",
  "ack": "I_APPROVE_SYNTHETIC_SCHEMA_WRITES"
}
```

Remote targets require TLS. `"ssl": false` is accepted only for loopback/local PostgreSQL. No app environment-variable changes are needed:

```text
node tests/isolated-postgres-concurrency.test.mjs --config /absolute/secure/path/isolated-postgres.local.json
```

The legacy dedicated URL/ack variables remain readable if already configured. Application/Production URLs are never used as fallback. The target gate refuses mo_bistro_2, main app URL matches, absent approval, name/host mismatch or insecure remote targets **before connecting**. After read-only identity/empty-database checks, it creates an exact generated schema and checks its search path. Cleanup removes only that validated schema. Timeouts bound database/lock waits. An interruption may leave synthetic schema data; inspect and separately approve cleanup rather than guessing paths.

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

Run repeatedly after the first successful approved run to capture varying interleavings. Record backend count, durations, expected conflicts, failures/timeouts and cleanup outcome without connection strings or customer data. Do not call skipped cases PASS.

## Additional readiness gates, not claimed covered by this harness

- Unmodified fresh-install and representative upgrade migration sequences on a dedicated disposable database's public schema. The harness uses the base migration plus scoped fixtures; it never rewrites or executes public-qualified upgrade scripts.
- Expired/rotating QR boundaries, actual rate-limit concurrency, malformed/schema/error classifications and whole-transaction failure injection.
- Mode switch versus seating, request approvals/rejections, multi-area requests and credential revocation under real sessions.
- Controlled sustained load and database outages; real browsers/devices; notification callbacks with approved isolated provider stubs.

Report these separately as BLOCKED/NOT TESTED until executed. Stop on any migration incompatibility or risk to existing data.

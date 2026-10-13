# Migration-backed QA harness readiness — 13 October 2026

**Prepared for an approved, completely empty PostgreSQL QA database. Real PostgreSQL execution remains NOT TESTED.** This update supersedes the earlier generated-schema/runtime-fixture initialization described in the stabilization report.

## Implemented

- The real concurrency harness now applies all six README core migrations in their documented order, byte-for-byte, to public. No migration file was changed and no replacement table DDL is synthesized.
- Local target validation precedes PostgreSQL client construction and any SQL: explicit synthetic-write acknowledgement, mo_bistro_qa_* database name, matching host, explicit credentials, single host, allowed TLS options, and application URL/pooled-host exclusion.
- Driver options explicitly pin host, port, database, user, password and public search path. Remote TLS verifies certificates/hostname. Connection URL query overrides cannot change the destination/session path, and PG* environment defaults are not used to select connection identity.
- A reserved connection verifies database/role/schema/search path/backend identity and writable-primary state. Bootstrap takes a session advisory lock and refuses existing non-system relations, routines, custom types or extra user schemas before DDL. Each migration verifies the same backend identity again.
- Migration failure stops the sequence, reports the migration name and bounded PostgreSQL code, and attempts to roll back the failing script's transaction. Previously committed migrations remain intact for inspection. Failed/passed runs never automatically drop the database or public schema.
- Runtime pool connections are identity-checked before fixture insertion. Fixtures use returned actor/table IDs, update the migration-created capacity rows, and clear request rows between synthetic scenarios. Cancel/seat races reject unexpected errors/response codes rather than accepting a matching final row alone.
- Authentication/license/provider boundaries remain synthetic; no WhatsApp integration is activated by the harness.

## Local validation

| Check | Result |
|---|---|
| Harness/helper syntax | PASS |
| TypeScript | PASS |
| Repository ESLint | PASS |
| Available offline test run | 134 successful assertions, 0 failures, 1 browser-fixture skip (tool paths not configured for this run) |
| New bootstrap/migration tests | 9 pass: target refusal, authorization, identity, emptiness, exact sequence, failure handling, changed backend, altered order, and migration-backed embedded fixtures/serial seating |
| Real PostgreSQL suite | NOT EXECUTED; deliberately excluded from the offline command so no configured target can accidentally run |

The embedded test applies the unmodified six-migration sequence to an empty in-memory PGlite engine. It validates core ETA/seating columns, migration-created pools, non-default actor/table identity sequences, named seating/release/request cancellation and Simple Mode seating/release. It does not prove remote PostgreSQL locks or concurrent transactions.

Evidence logs: outputs/migration-backed-harness-20261013/offline-tests-final.log, typescript.log and lint.log, outside the checkout. Initial seven-test and full 132-assertion runs were expanded with two further guard cases; the final 134-assertion run passed.

## Run prerequisites

1. Obtain an independently verified empty disposable QA database/direct host, entirely separate from Preview and Production, named mo_bistro_qa_*. Neon -pooler endpoints are refused; use the direct connection for the session-locked migration bootstrap.
2. Do not apply migrations manually first: the harness owns initialization and refuses populated targets.
3. Use a secure JSON config file with url, databaseName, host and ack=I_APPROVE_SYNTHETIC_SCHEMA_WRITES. See docs/isolated-postgres-concurrency-plan.md. No application environment-variable changes are required.
4. After approval for that exact target, run from the repository:

```text
node tests/isolated-postgres-concurrency.test.mjs --config /absolute/secure/path/isolated-postgres.local.json
```

5. Retain resulting schema/synthetic fixtures and logs for inspection. Another complete run needs a newly approved empty database or separately reviewed disposal/recreation. Do not bypass the emptiness check.

Fresh-install compatibility and concurrency against real PostgreSQL are pending this run. Representative upgrade testing, live authentication/license checks, provider delivery and sustained load/outage tests remain separate requirements.

No database was provisioned, no remote SQL ran, no application environment was changed, and no message, push or deployment occurred during preparation. Existing WhatsApp, UI and stabilization commits remain preserved.

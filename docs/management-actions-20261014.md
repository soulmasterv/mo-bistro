# Guest readiness and Management bulk actions

Guest tracking now returns an active booking's personal `eta_at`, which PostgreSQL
already selected but previously omitted from the response. The guest status page
shows that expected clock time in place of the general estimate. Clearing it
restores the restaurant estimate. Seated/cancelled/no-show pages keep their existing
terminal-state UI. Tracking remains token-authenticated and exposes no phone data.
Almost Ready scheduling and all consent/sending controls are unchanged.

Management has separate custom confirmations for two PostgreSQL-only bulk actions:

- Free all tables: releases occupied named and anonymous inventory, closes open
  named seating-history records, records anonymous release events with the manager
  ID and cancels pending table-ready requests. Guest status and `seated_at` are kept.
- Cancel all waiting bookings: changes only waiting/called bookings to cancelled,
  retaining seated guests and history. Pending/scheduled notification revisions
  are invalidated when the notification table exists. Messages already in flight
  cannot be recalled. No provider or dispatcher is called.

The endpoint enforces manager authentication, same-origin requests, active license,
strict explicit-confirmation payloads and PostgreSQL. Each operation runs in one
transaction under the existing seating and capacity advisory locks. A mismatched
Simple Mode table pair fails before inventory writes; SQL failures roll back the
transaction. No schema is created. Double clicks are blocked; requests are never
automatically retried. Network uncertainty requires inspecting current state.

Validation uses mocked handler SQL and a local browser fixture only. No bulk action
was run against Preview, Production or QA. Real PostgreSQL rollback/concurrency of
these new bulk actions remains unverified; the prior isolated QA concurrency result
does not cover this new endpoint. No new migration is required on the already
migrated PostgreSQL schema. SQLite bulk reset intentionally returns 503.

Final local validation: TypeScript, repository-wide lint and the production build
passed. The offline suite passed 144 tests with its optional browser test skipped;
the browser workflow was then executed separately and passed across 320, 390, 768,
1024 and 1440 pixel viewports. It covered pending cancellation and error recovery,
personal ETA/fallback refresh, separate bulk confirmations and disabled controls,
and read-only WhatsApp setup progress. All API responses in that browser run were
synthetic; no customer messages or live resets were performed.

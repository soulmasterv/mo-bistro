# Staff-only booking notes and edits

Reception and managers can open **Staff notes & booking** in the guest detail sheet. Notes support 1,000 characters. Name (2–100 characters), party size (1–30) and seating preference can be edited while waiting/called. Once seated, only notes are editable; closed bookings reject all changes. Phone, status, tracking links, queue position, confirmation and WhatsApp consent cannot be supplied through this endpoint.

The private staff endpoint is `/api/guests/[id]/staff-details`. Notes and before/after history live in separate tables rather than the public guest record. Public API payloads and WhatsApp messages do not include notes. Audit history shows the authenticated staff member, time and before/after values for the ten latest saves. Audit insertion and booking/notes mutations commit together; audit failure rolls everything back. History and notes cascade with normal guest cleanup.

Each save locks the authoritative guest row, shared with seating workflows. The server checks the latest status before writing. A revision detects another staff save; stale drafts receive 409 without overwriting data. Unchanged saves create no history. A lost success response can require an explicit reload before retrying; it cannot silently overwrite another save. UI disables actions while saving and preserves drafts on errors. Reload is explicit and labelled as replacing the draft. No browser popups are added.

Only reception/manager authentication permits reads. Writes additionally enforce same-origin checks and active licensing. The server derives the actor from the session; unknown payload fields are rejected. No WhatsApp job is created by editing. Existing pending notifications use the current booking name under the existing sender policy. SQLite/local databases fail safely with setup guidance; no runtime schema creation is added.

## Preview activation — separate approval required

The code is compatible before migration and shows setup guidance instead of pretending a save worked. Apply only `migrations/20261016_staff_booking_edits.sql` after explicit approval. It creates `guest_staff_details` and `guest_booking_changes` plus their index; it does not backfill, modify or delete existing records. Five-second lock and thirty-second statement timeouts bound schema work. No environment variable changes are needed.

The intended target is Neon project `summer-cell-27734526`, Preview branch `br-misty-king-b4tugm8h`, endpoint `ep-still-wind-b4036sdr`, database `mo_bistro_2`, schema `public`. Development shares this database. Production is excluded; the earlier ETA migration approval does not cover this new migration.

Before applying: verify the selected branch and actual deployment database target, restore-history availability, expected guest/staff ID columns, creation permissions and absence of both new tables. Stop for existing/incompatible objects or a different target. Do not drop anything or rerun broad historical migrations.

```sql
SELECT current_database(), current_schema(), current_user,
  to_regclass('public.guest_staff_details') AS details_table,
  to_regclass('public.guest_booking_changes') AS audit_table,
  has_schema_privilege(current_user,'public','CREATE') AS can_create;
SELECT table_name,column_name,data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN ('guests','staff_users') AND column_name='id';
```

After applying, verify table columns/defaults/check constraints, cascade foreign keys to guests, nullable actor reference, descending guest history index and application SELECT/INSERT/UPDATE access to details and SELECT/INSERT access to history. Test one synthetic waiting booking: save notes/details, reload, inspect actor/history, reject a stale save, then confirm notes stay absent from the public tracking response. Do not change real guests to test this.

## Validation

Migration-backed synthetic PostgreSQL tests cover private notes, staff actor/history, missing setup, stale saves, unchanged saves, seated/closed restrictions, validation/auth/origin/license checks, cleanup cascades and audit rollback. They do not prove real multi-session PostgreSQL concurrency. The UI fixture uses the actual React sheet and CSS with synthetic fetch responses: desktop/mobile editing, immediate busy state, save/history, draft preservation and explicit conflict recovery were exercised. The temporary fixture route was removed before release.

Broader WhatsApp formatting is on today's checklist after this feature. User confirmed the real +60-minute review message arrived.

Audit records snapshot the authenticated staff username so later account renaming does not rewrite history. Full offline suite: 182 passed, four opt-in tests skipped. Six focused staff-booking tests passed again after adding the username snapshot. TypeScript, changed-file lint and Webpack build are checked before release. Real multi-session concurrency and deployed mutation testing remain unverified; no staff-booking migration has been applied remotely.

Read-only Preview preflight confirmed `mo_bistro_2`, public schema, inspected role `neondb_owner`, CREATE privilege, both new relations absent and integer IDs on guests/staff_users. Prior ETA approval is not treated as permission to apply this migration.

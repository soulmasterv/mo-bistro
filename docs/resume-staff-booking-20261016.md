# Resume checkpoint — 16 October 2026

User requested saving/pushing current work and stopping until they ask to continue. Do not resume automatically.

## Pushed application code

- `24e8d169eebbdad845d4e138f19e2cc4db52dfcd`: private staff notes, name/party-size/preference editing, audit history, revision conflicts, role/origin/license guards and synthetic tests.
- `6af49139f8c40589499a85e07b287a3ed9eae211`: correct Postgres.js audit snapshot encoding using `::text::jsonb`; adds follow-up audit repair migration and regression coverage.
- Both commits pushed to `feature/mo-bistro-ui-rebuild` and `Development`. Latest application deployments for `6af4913` were Ready: feature `A1wbP5FosBpNn2yrc6NaadMZ99Dc`, Development `4yP4GZSPsWfrymwArJgfNVSUhFE1`.
- Production was not changed. No application environment variables were changed.

## Database state — distinguish applied from pending

Verified Neon project `summer-cell-27734526`, Preview branch `br-misty-king-b4tugm8h`, endpoint `ep-still-wind-b4036sdr`, database `mo_bistro_2`, public schema. Development intentionally shares this Preview database. Do not use the older `ep-small-mouse` database target.

**APPLIED:** `migrations/20261016_staff_booking_edits.sql`. User explicitly authorized necessary Preview/Development fixes and requested no backups. No backup was created. Transaction committed; table permissions, FK cascades, notes length/revision checks and history index verified.

**NOT APPLIED:** `migrations/20261016_staff_booking_audit_json.sql`. Stop occurred immediately before applying it. This normalizes string-valued snapshots and adds an object-only JSON check. Do not claim this follow-up schema/data repair is complete.

## Live test and discovered issue

Signed in to Preview using credentials supplied directly by the user. Never copy those credentials into files, logs or replies; obtain private sign-in again if needed.

Created synthetic staff walk-in booking **90**, initially `QA Staff Edit Test`, synthetic phone ending `0901`. Staff-created bookings do not grant WhatsApp consent. Saved name `QA Staff Edit Updated`, party size 3, indoor preference and note `Synthetic QA note: quiet table requested.` The save persisted and the queue refreshed. Booking remains waiting and has not been canceled or seated.

The first live audit row (ID 1, guest 90) has `before_values` and `after_values` as JSON **strings** rather than objects. The history showed actor/time but no field differences. Postgres.js inferred JSONB from the original parameter cast and serialized already-stringified JSON again. Embedded tests did not model that inference. Code fix `6af4913` is now deployed, but **new real-driver writes have not yet been retested**.

Next steps, only after user resumes:

1. Recheck Preview target and deployed compatible code. Apply the follow-up `20261016_staff_booking_audit_json.sql` transaction under the user's existing Preview/Development authorization. It preserves history; malformed/non-object snapshots fail safely. Do not create a backup against the user's instruction.
2. Verify both snapshot JSON types are objects and the object-only constraint exists.
3. Reload the primary test editor, save a new synthetic note and inspect live before/after field differences and server actor. Confirm actual driver writes objects.
4. Use two loaded editor views to verify stale revision rejection and draft preservation. A second tab was opened with booking 90 at revision 1, but the actual stale save has **not** been performed. Reload/recreate the baseline as necessary.
5. Check no WhatsApp jobs were created for this unsubscribed synthetic booking; cancel only booking 90 after testing so it does not remain in the queue.
6. Update `docs/today-checklist-20261016.md` after live checks, then commit/push any further fixes.

## Validation completed

- Latest full offline suite: **183 passed, 4 opt-in skipped, 0 failures** (187 total).
- Latest focused staff-booking suite: **7 passed**, including JSON normalization/rejection and audit failure rollback.
- TypeScript and changed-file lint passed after the audit fix. Webpack production build passed for the feature; both latest Vercel application builds also Ready after the SQL cast fix.
- Actual React fixture checked desktop and 390px mobile save/history, immediate busy state, stale-error draft preservation and explicit reload. Field contrast corrected for dark mode. Fixture route removed and local server stopped. Generated stale fixture types cleared before successful build.
- Evidence: workspace `outputs/comments-20261014/staff-booking-mobile.jpg`. Synthetic fixture source saved there for reference; do not deploy it.
- Real multi-session simultaneous concurrency has not been tested for this feature.

## Browser handles at stop

Browser ID `2` (IAB). Use current browser docs before continuing after compaction; discover tabs if handles are stale, never dump credential fields.

- Tab 10: Neon Preview SQL editor. Last query inspects audit JSON types for guest 90; no pending repair transaction started.
- Tab 16: Vercel deployments.
- Tab 17: authenticated Preview, primary guest editor for booking 90.
- Tab 18: authenticated Preview, second guest editor for booking 90, old revision 1.

Temporary local fixture tabs may show connection errors after the server stopped; do not inspect their data URLs or bypass URL policy. They need not be retained.

## Other task context / preserved work

- User confirmed automatic acknowledgement, manual ETA update and the real **60-minute review message** all arrived. Review button is a temporary `Leave a review` reply button with no URL or business action.
- **Today's final-priority item:** polish formatting of every WhatsApp message type (acknowledgement, ETA changes, Almost Ready, review), including consistent wording, spacing, times, booking IDs, buttons and unsubscribe footer. User requested adding this to the checklist; formatting implementation has not started.
- Unrelated staff-announcement work remains unstaged/untracked in the working tree: subscription-control files, globals/header, announcement API/component/library/migration/tests, `.env.example` and license harness. Preserve it and do not sweep it into this feature's commits.
- Additional untracked environment audit/reset and older WhatsApp resume documents remain on disk. Do not print secrets or commit credentials.

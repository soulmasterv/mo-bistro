# Preview ETA notification repair — 16 October 2026

Booking 89 confirmed automatic application-originated acknowledgement delivery. Its later Almost Ready job was published, then skipped with `notification_content_unconfigured`. Immediate ETA-change jobs were not created because `guest_eta_changes` was absent.

## Code repair

Inside a verified open customer window, Almost Ready now has default text identifying the booking, describing the approximate ten-minute estimate and asking the guest to await reception confirmation. Configured text still overrides this default. Closed windows still require the appropriate approved template. Subscription, STOP, booking eligibility, Preview recipient restrictions and duplicate-send protections remain unchanged. No environment variable changes are necessary for this default.

## Migration target and preflight

Target only Neon project `summer-cell-27734526`, branch `br-misty-king-b4tugm8h` (`mo-bistro-preview`), endpoint `ep-still-wind-b4036sdr`, database `mo_bistro_2`, schema `public`. Development intentionally shares this Preview database. Production is excluded.

Read-only preflight confirmed database `mo_bistro_2`, schema `public`, role `neondb_owner`, absent `guest_eta_changes`, absent notification `event_key`/`eta_snapshot_at` columns, and the exact expected old constraints:

- `whatsapp_notifications_guest_id_kind_key`: `UNIQUE (guest_id, kind)`
- `whatsapp_notifications_kind_check`: confirmation, almost_ready, review

Use only the existing `migrations/20261015_whatsapp_eta_updates.sql` transaction. It adds ETA event/snapshot metadata, request replay tracking and partial uniqueness. It does not delete or backfill bookings, consent or delivery history. Compatible code is already deployed on both feature and Development branches. Confirm recovery availability and no active sending jobs immediately before applying. Abort rather than dropping unexpected objects or resolving conflicts automatically.

After application, verify the new table/columns, kind/snapshot constraints, partial unique indexes, and application role access. Never roll back to code using the old full `(guest_id,kind)` uniqueness contract.

## Controlled delivery check

After the compatible deployment is Ready and migration verified, save one new ETA for subscribed test booking 89 through reception. For <=10 minutes, expect one immediate ETA update; for >10 minutes, expect one immediate update plus one future Almost Ready job. Read notification and delivery logs to distinguish queued, provider acceptance and delivered. Do not manually rearm an old skipped job or change historical timestamps. Keep the Preview test recipient restriction.

Review-message content and its real +60-minute test remain separate work. Message-format polish stays last priority.

## Verification / execution status

- 53 focused window/WhatsApp tests passed, including the migration-backed synthetic ETA scenarios and default Almost Ready content with no override. Closed-window template enforcement remains tested.
- TypeScript, changed-file lint and Webpack production build passed.
- Neon reports a six-hour restore-history window. Read-only preflight found zero notifications in `sending`.
- Migration execution was blocked by automatic approval review because the earlier prohibition on Preview database changes was not explicitly overridden. No migration was executed. Obtain explicit approval for this shared Preview/Development schema change before clicking Run. The prepared SQL editor contains the existing migration with local five-second lock timeout, thirty-second statement timeout, public search path, an exclusive notification-table lock and guards for database identity/active sends.
- No old skipped job was rearmed and no extra message was sent during this repair.

## Approved application

The user subsequently explicitly approved the ETA migration on shared Preview/Development. The prepared guarded transaction was executed on the verified Neon Preview branch and completed with COMMIT. Postflight confirmed the request table and both event columns, removal of the old uniqueness constraint, exact partial unique index definitions, the four-kind check and ETA snapshot check, and SELECT/INSERT access for the inspected role. No PostgreSQL errors were reported.

Vercel confirmed both `a9cb248` deployments Ready: feature `GZm9qE9FL9vRxCUzkjs1gd3csmbY`, Development `3m2dBBKoowSEMrRjSYP2yEB5RNyS`. Production and environment variables were not changed. Awaiting one new five-minute ETA save on test booking 89 to verify actual immediate-message delivery. The prior skipped Almost Ready notification was not rearmed.

## Live ETA delivery verified

User saved a five-minute ETA on booking 89 at 19:05 Cairo. The application created and published one new `eta_update`, with expected readiness 19:10 Cairo. Notification status `sent`, attempts 1, scheduler ID and provider ID both present, no error. The signed delivery webhook recorded `delivered` at 2026-10-16 16:05:26 UTC. User confirmed receipt and the correct 7:10 time. No new Almost Ready alert was created for this short ETA; the old skipped alert remains historical. Message-format changes remain last priority.

# Preview suspension UI and 24-hour grace rollout

Prepared only. No Preview/Production migration, environment edit, license action or message send was performed for this change.

## Final behavior

- **24-hour notice:** Calm reminder, followed by a persistent countdown banner after Continue working. All normal operations remain available until the shared database deadline.
- **Immediate suspension / grace ended:** Warm signature, with only Sign out. The underlying workspace is inert. No Check access button. Open sessions poll every 15 seconds and check again on focus; the visible countdown locks immediately at its deadline. APIs check the database on every protected mutation, independently of the UI.
- The deadline begins when the owner confirms the notice. It is not extended by a guest/staff login, browser acknowledgement, refresh, clock changes or repeated requests. Reactivation/renewal clears it; a later separately confirmed suspension is a new episode.
- Starting grace requires a currently active, unexpired license. An explicit owner-issued grace grants the full 24 hours even if normal billing expiry occurs within them. After that, expired billing requires renewal; Reactivate does not add subscription time.
- Immediate suspension can end an existing grace period early. Existing suspended accounts receive no automatic grace during migration/deployment.
- License changes and their audit entry commit together. A monotonically increasing revision prevents old confirmations from becoming valid again after suspend/reactivate cycles.
- Until the migration is approved/applied, the new API supports the original schema and immediate actions, while refusing/disabling 24-hour notices explicitly.

## Read-only preflight

Run privately in the SQL editor for the verified **Preview endpoint / mo_bistro_2**. Do not use a connection merely because its database name matches; verify its Neon branch and endpoint independently.

```sql
SELECT current_database(), current_user, current_schema();
SHOW search_path;
SELECT to_regclass('public.restaurant_license') AS license_table,
       to_regclass('public.license_audit_log') AS audit_table;
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('restaurant_license','license_audit_log')
ORDER BY table_name, ordinal_position;
SELECT id,status,plan,expires_at FROM public.restaurant_license;
SELECT conname,pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid IN
 ('public.restaurant_license'::regclass,'public.license_audit_log'::regclass);
```

Expected base schema is `migrations/002_licensing.sql`. The new names `restaurant_license.suspension_due_at`, `restaurant_license.license_revision`, and `license_audit_log.details` must all be absent. If any are already present, or the base schema differs, **stop and reconcile**; do not blindly rerun or drop anything. Keep an operator-controlled schema/data backup before authorized DDL.

## Ordered activation, after approval

1. Deploy the tested feature-branch API/UI to **Preview**, preserving existing safety/environment settings. Validate the migration-free immediate-suspension path first.
2. Separately approve/apply `migrations/20261016_license_grace.sql` to the verified Preview database. It only adds three columns, runs in a transaction and times out if locks cannot be acquired. No rows are deleted and no existing license status/expiry changes.
3. Run the postflight below using the intended API credentials privately. Existing reader SELECT and writer table-level privileges cover the new columns; column-level grants may need an independently reviewed update.
4. Update the four changed panel files from `integrations/subscription-control` into `/home/local/subscription-control` (mapped as `Y:\subscription-control`): `app.js`, `license-control-client.mjs`, `public/index.html`, `public/panel.js`. Back up these files first. Preserve `.env`, Cloudflare auth and dependency files. Restart only its existing PM2 process after approval.
5. Sign in and Check connection. The setup response must have `ready:true` and `graceReady:true`. Confirm the correct Preview identity. Do not test license-changing controls against real data without approval.

```sql
SELECT id,status,plan,expires_at,suspension_due_at,license_revision
FROM public.restaurant_license;
SELECT COUNT(*) FILTER (WHERE suspension_due_at IS NOT NULL) AS existing_notices
FROM public.restaurant_license; -- zero immediately after this migration
SELECT table_name,column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND
 ((table_name='restaurant_license' AND column_name IN ('suspension_due_at','license_revision'))
  OR (table_name='license_audit_log' AND column_name='details'));
SELECT has_table_privilege(current_user,'public.restaurant_license','SELECT') AS can_read_license,
       has_table_privilege(current_user,'public.restaurant_license','UPDATE') AS can_update_license,
       has_table_privilege(current_user,'public.license_audit_log','INSERT') AS can_audit;
```

Do not roll back to pre-grace code while a deadline is stored: old code does not enforce scheduled suspension. Resolve outstanding notices with reviewed owner actions first, or keep the new API running. Additive columns do not need removing.

## Checks and boundaries

Embedded PostgreSQL tests cover the migrated and legacy schemas, the 24-hour interval, repeat/replay protection, expired deadlines, immediate suspension during grace, reactivation, renewal, stale revisions and atomic audit rollback. Browser tests exercise the real staff component and panel with synthetic APIs/SQL at mobile/desktop sizes. These are not claims of real concurrent PostgreSQL sessions or deployed email delivery.

Validation for this change: 162 offline tests passed (four skipped), plus both explicit licensing browser tests passed; TypeScript and lint passed. The production build passed with `next build --webpack`. The default local Turbopack build could not launch its CSS worker (child exited before connection, code 0); no application/compiler configuration was changed to hide that local tooling issue.

The existing “Cancel all waiting bookings” action correctly refuses a suspended license before any booking SQL. Synthetic testing verifies it becomes available when active. Seated bookings are intentionally preserved.

## Email and messaging prerequisites

Email is independent of this rollout. The panel's notice confirmation explicitly states that no email is sent yet. Do not present an email as queued/delivered before a real outbox/provider integration is configured and verified.

Planned sender: `Labbing <no-reply@labbing.space>`, reply-to `subscribtion@labbing.space`. Those addresses do not yet exist. Cloudflare Email Sending must be enabled for the sending domain, with approved plan/billing and DNS authentication. Preserve Zoho receiving MX records when onboarding a sender; any receiving/routing change requires a separate review. The recipient/contact list, reminder timing, provider credential and authorized test recipient must be configured privately before testing. Desired notices: grace started, reminder, service paused and access restored. License enforcement must not depend on email-provider availability.

Staff announcements and automatic WhatsApp notifications remain separate work. Existing WhatsApp automatic dispatch requires BOTH `WHATSAPP_MODE=live` and `WHATSAPP_ALLOW_LIVE_SEND=true`, plus valid consent, recipient restrictions, an open matching customer window or applicable approved template and queue/provider configuration. Keep the current `test`/`false` settings unchanged until explicitly authorized; the isolated Preview test sender can deliver without enabling general automatic sending.

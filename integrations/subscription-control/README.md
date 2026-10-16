# Subscription Control → Mo Bistro Preview

The original `Y:\subscription-control\server.js` displayed the license directly from its own database connection. Its management actions were placeholders. This integration uses the Mo Bistro owner API for both reads and writes, so the displayed license and the affected license share the same database target.

## Scope and controls

- Fixed destination: `https://preview.mo-bistro.labbing.space`. Production URLs are rejected.
- Existing Cloudflare Access authentication and owner-email restriction remain in `cloudflare-auth.js` on the panel server. That private configuration is deliberately not included here.
- The browser never receives `LICENSE_ADMIN_TOKEN`. The server uses the existing 64-character owner token.
- Same-origin checks, expiring owner-bound CSRF tokens, request limits and custom confirmations protect panel actions.
- Activate creates a monthly license; Renew adds one calendar month from the later of now or the existing expiry; Suspend blocks access; Reactivate removes suspension without extending an unexpired license. An expired suspended license needs renewal.
- All mutations require the version that was displayed before confirmation. Stale or repeated requests fail with HTTP 412. The API serializes changes and records the audit row in the same transaction. Failed/uncertain requests are never retried automatically.
- Announcements remain unavailable; this integration sends no customer or staff messages.

## Source installation (prepared, service not restarted)

Copy only `server.js`, `app.js`, `license-control-client.mjs` and the three files in `public/` into the existing panel folder. Back up the original `server.js` first. Preserve `.env`, `cloudflare-auth.js`, `package.json`, `package-lock.json` and `node_modules`. Existing dependencies are sufficient. The package file here supplies the module boundary for local testing and is not an instruction to replace the server package.

The six source files were installed into `Y:\subscription-control` during this task. Their hashes were verified, and the protected files were checked unchanged. The previous server file has a timestamped `server.js.before-license-wiring-*.bak` backup. No process was restarted.

## Activation prerequisites — separate deployment approval required

1. Deploy the feature branch's updated Mo Bistro API to **Preview** first. This task did not push or deploy it. The branch also contains earlier unpublished UI/WhatsApp changes; review the complete pending branch before deployment.
2. Verify the existing panel `LICENSE_ADMIN_TOKEN` hashes to Preview's `LICENSE_ADMIN_KEY_SHA256`. Compare privately; never paste either value into logs or commits. No values were changed or verified against deployed secrets in this task.
3. Preview's license reader uses `MO_BISTRO_POSTGRES_URL` (required when `MO_BISTRO_DB=postgres`), otherwise the existing `DATABASE_URL` fallback. `LICENSE_ADMIN_DATABASE_URL` must identify the same host/endpoint, port and database. Separate restricted reader/writer credentials are supported; pooled/unpooled URLs for the same Neon endpoint are accepted. Ambiguous connection-routing query parameters are rejected.
4. Existing `migrations/002_licensing.sql` defines `public.restaurant_license` and `public.license_audit_log`. Immediate actions remain compatible with that schema. **24-hour notices require the separately reviewed `20261016_license_grace.sql` migration**; see [the ordered rollout and read-only checks](../../docs/license-grace-preview-rollout.md). Do not rerun migrations blindly. The writer needs SELECT/INSERT/UPDATE on the license, SELECT/INSERT on the audit table and USAGE on its sequence. The reader needs SELECT on the license.
5. Restart the existing panel Node process on `127.0.0.1:5065` after approval, preserving its Cloudflare tunnel and authentication configuration.
6. Sign in through Cloudflare Access and select **Check connection**. This only reads setup/status. Confirm readiness and Preview identity. Setup failures keep mutations disabled. Testing Activate/Renew/Suspend/Reactivate changes the actual Preview license and requires explicit approval.

If a mutation response is uncertain, refresh status and audit history before deciding whether another action is appropriate. Do not blindly repeat renewal.

## Validation evidence

- Updated offline suite: 162 passed, 0 failed; four opt-in/environment-dependent tests skipped in that invocation. Both licensing browser tests were also run explicitly and passed locally.
- Explicit panel browser run: passed separately at 390px and 1440px, including custom confirmations, processing locks, audit display and no horizontal overflow.
- Actual API handlers and embedded PostgreSQL-compatible SQL were exercised with synthetic data: activation, renewal, suspension, reactivation, expiry, stale requests, authorization/CSRF rejection, target mismatch, provider failure and audit-failure transaction rollback.
- TypeScript, lint and production build passed.

These are local tests. The browser fixture stubs Cloudflare authentication; it does not verify the deployed Access policy. Embedded SQL tests do not establish real multi-session PostgreSQL concurrency. No live license was changed, remote database queried, environment edited, message sent, service restarted or deployment performed.

Run the offline API tests with `node --test tests/license-control.test.mjs`. The optional browser test accepts `--panel-deps <existing-panel-node_modules> --playwright <playwright-package-directory> --screenshots <output-directory>`; it creates only local synthetic fixtures.

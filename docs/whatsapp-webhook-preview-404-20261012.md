# WhatsApp webhook 404 investigation — 12 October 2026

## Reproduced cause

A read-only GET to https://preview.mo-bistro.labbing.space/api/whatsapp/webhook returned HTTP 404 with an HTML Next.js page.

Vercel deployment DJ5WUYbcq8U638GAhRstAbgJGBgq (mo-bistro-gpbmirqxm-mo-bistro-system.vercel.app) lists the custom Preview domain and source commit 5c9351eebcdb70d853eca826558aa5b80e91432e. That commit does not contain src/app/api/whatsapp/webhook/route.ts, verified against its Git tree. This is a redeployment of an older snapshot, even though its displayed branch is feature/mo-bistro-ui-rebuild. A redeploy does not automatically update its source to the branch's latest commit.

The current feature branch has the App Router route with GET and POST exports. src/proxy.ts only matches / and /management/:path*, so it does not intercept the webhook. next.config.ts has no rewrites, redirects, export mode or base path. No tracked Vercel deployment configuration overrides routing.

The older immutable Preview was protected by Vercel authentication in unauthenticated HTTP checks (302). No protections were changed or bypassed. Meta callbacks must reach the endpoint without an interactive sign-in; if protection blocks them, use an appropriately configured approved callback environment rather than disabling security protections as part of this fix.

## Change

The route explicitly stays dynamic and returns valid Meta challenges with status 200, Content-Type text/plain; charset=utf-8 and Cache-Control no-store. The challenge is returned verbatim, preserving leading zeros and large digits. Existing mode/token checks, constant-time comparison, numeric challenge validation, feature gate and POST signature verification remain unchanged.

Added standalone verification tests that forbid all database and provider access. No database connection URL is supplied to local runtime verification.

## Validation

- Five standalone checks pass: successful exact verification, invalid/missing token or mode, invalid challenge, disabled feature, and unsigned POST rejection.
- Local optimized production build and TypeScript pass.
- Build route output lists /api/whatsapp/webhook as dynamic; .next/server/app-paths-manifest.json maps it to app/api/whatsapp/webhook/route.js and the compiled file exists.
- Local compiled next start on loopback returned HTTP 200 with exact body 000123456789012345678901234567890 and text/plain; charset=utf-8. Wrong token returned 403 Forbidden.
- Changed route/test files pass lint.

## Preview deployment requirements

1. Push the new local commit to feature/mo-bistro-ui-rebuild before using its SHA in Vercel. Create a new Preview from that exact SHA; do not redeploy the old 5c9351e snapshot. Verify the resulting deployment's Source SHA.
2. Confirm preview.mo-bistro.labbing.space aliases the resulting Ready deployment. Do not promote to Production or change the Production domain.
3. Configure META_WEBHOOK_VERIFY_TOKEN in the Preview environment to the same secret value entered into Meta. Keep the value out of logs and reports.
4. Existing authentication requires WHATSAPP_ENABLED=true and MO_BISTRO_DB=postgres for GET verification. Preserve WHATSAPP_MODE=test and WHATSAPP_ALLOW_LIVE_SEND=false (or unset) to prevent real messages. Setting these variables is a separate deployment configuration action; none were changed remotely in this investigation.
5. POST continues to require META_APP_SECRET for signed payload verification. It additionally needs the existing isolated database and WhatsApp schema to process events. GET verification itself performs no database operation and requires no migration.
6. Redeploy Preview after environment changes. Verify a valid subscribe/token/challenge request returns 200 with the exact plain-text challenge; wrong token must still return 403. A bare GET normally returns 403, not 200. An unsigned enabled POST must remain 401.

No new database migration is required. Production, main, live databases, credentials and scripts/import-production-guests.mjs were untouched. No WhatsApp messages were sent. The live endpoint remains 404 until its deployment/domain mapping is corrected; local verification does not claim that remote correction has already happened.

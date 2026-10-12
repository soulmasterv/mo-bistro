# Isolated Preview WhatsApp test

Deploy the feature branch to Vercel Preview only. Do not promote to Production.

Preview-scoped settings:
- WHATSAPP_PREVIEW_TEST_ENABLED=true (default disabled)
- WHATSAPP_TEST_RECIPIENT=the personal, Meta-verified test recipient in international format
- WHATSAPP_MODE=test
- WHATSAPP_ALLOW_LIVE_SEND=false
- MO_BISTRO_DB=postgres, using an isolated Preview database only
- META_WHATSAPP_ACCESS_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID, META_GRAPH_API_VERSION
- WHATSAPP_CONFIRMATION_TEMPLATE and WHATSAPP_TEMPLATE_LANGUAGE matching the approved Meta template
- Existing STAFF_SESSION_SECRET and Preview authentication configuration

Vercel supplies VERCEL_ENV=preview. Do not spoof this in Production. Existing api_rate_limits schema must be present in the isolated Preview DB; no new migration is required. The rate limiter writes only its existing Preview request counter. No booking, consent, notification or delivery records are created or modified by this test.

The approved confirmation template must have two body text parameters (name, booking reference) and quick-reply button index 0, as required by the existing integration. This test sends Preview Test / 0 with an inert synthetic booking association. It is not a real reservation and replying cannot subscribe a customer. Verify this template structure in Meta before enabling.

Sign in as Manager, open Management, click Send Test WhatsApp, and accept the explicit confirmation. No request occurs on page load. The server takes the recipient exclusively from configuration. One provider request occurs per accepted action, with no automatic retry; the UI disables after the attempt. The existing persistent limiter permits at most one attempt per trusted Vercel source IP per hour. This is not a lifetime one-send guarantee across different IPs. Disable WHATSAPP_PREVIEW_TEST_ENABLED after the test.

Meta HTTP status and safe message ID/result are displayed. Accepted means provider acceptance, not confirmed device delivery. Network uncertainty is not automatically retried. Normal sendTemplate and QStash paths retain their simulation gates; this action does not drain the outbox or call those paths. Never enable live mode for this test.

Verification: 5 isolated endpoint/recipient tests and 32 existing WhatsApp tests passed with mocked providers. Lint passed; optimized PostgreSQL-mode build includes /api/whatsapp/test. No actual WhatsApp message, deployment, migration or live database operation was performed.

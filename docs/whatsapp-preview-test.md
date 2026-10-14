# Isolated Preview plain-text WhatsApp test

Deploy feature/mo-bistro-ui-rebuild to Vercel Preview only. Never promote this test setup to Production.

Preview-scoped variables:
- WHATSAPP_PREVIEW_TEST_ENABLED=true (disabled by default)
- WHATSAPP_TEST_RECIPIENT=your personal Meta-verified recipient, international format
- WHATSAPP_MODE=test
- WHATSAPP_ALLOW_LIVE_SEND=false
- WHATSAPP_ENABLED=true (required for the signed incoming webhook)
- MO_BISTRO_DB=postgres with an isolated Preview-only MO_BISTRO_POSTGRES_URL
- META_WHATSAPP_ACCESS_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID, META_GRAPH_API_VERSION
- META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN and existing STAFF_SESSION_SECRET

Vercel provides VERCEL_ENV=preview. Do not spoof it in Production.
Apply migrations/20261012_whatsapp_preview_test.sql ONLY to the isolated Preview DB. Existing api_rate_limits and WhatsApp schemas must also be available. No migration has been applied by this task.

No approved template is required for this isolated action. Normal confirmation, almost-ready and review templates remain unchanged.

Configure the Meta messages webhook to this Preview deployment with existing signature verification. From WHATSAPP_TEST_RECIPIENT, send a message to the configured Meta test number. The signed inbound must be received after this migration and implementation are enabled. Old receive-time logs are insufficient evidence; migrated or fabricated timestamps are not accepted. The actual Meta timestamp must be within the last 24 hours, not in the future, and match both configured recipient and business number.

Sign in as Manager, click Send Test WhatsApp and explicitly confirm. Exact body:
Hello! 👋 This is a test message from Mo Bistro. Your WhatsApp integration is working successfully!

Each accepted action makes one provider request, with no automatic retry. Existing limiter remains one attempt per trusted source IP per hour; UI disables after the attempt. Disable WHATSAPP_PREVIEW_TEST_ENABLED after testing. A failed or unknown result is not retried automatically.

Safe Meta HTTP status and provider message ID appear in Management. Signed delivery callbacks update the isolated test record; read-only polling displays delivery status for the current attempt. Provider acceptance alone is not device delivery. Unknown response can be reconciled by the opaque test ID.

Dedicated Preview tables record only verified test inbound timestamps and isolated test attempts. Ordinary test messages bypass customer consent processing. Explicit SUBSCRIBE and text STOP/UNSUBSCRIBE commands follow the existing signed-webhook, booking-phone, code/expiry, replay and opt-out checks, including normal scheduling/invalidation for those consent events. While isolated mode is enabled, the webhook does not dispatch the customer outbox. The Management send action itself never changes customer bookings, opt-ins, queued notifications or normal template requirements. Production does not activate these Preview-only code paths.

Validation uses mocked providers and isolated PGlite only. No real message, live database operation or migration application is performed during implementation.

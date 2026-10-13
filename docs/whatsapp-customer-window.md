# Window-aware automatic WhatsApp notifications

Local implementation on feature/mo-bistro-ui-rebuild. No environment values, databases or deployment were changed, and no message was sent.

The existing confirmation, almost_ready and review events are retained. Delivery still claims the existing job once, checks consent/STOP/booking eligibility under the existing phone lock, and writes the existing notification/delivery logs. General real sending continues to require WHATSAPP_ENABLED=true, MO_BISTRO_DB=postgres, WHATSAPP_MODE=live and WHATSAPP_ALLOW_LIVE_SEND=true. Test mode or allow=false never makes a real provider request.

New flag WHATSAPP_WINDOW_TEXT_ENABLED defaults off. When enabled, signature-verified inbound messages are recorded in whatsapp_customer_windows, keyed by recipient and business phone-number ID. Upserts retain the greatest actual Meta timestamp, not webhook receive time. Future timestamps do not open a window. Metadata must match META_WHATSAPP_PHONE_NUMBER_ID before recording. This record does not subscribe a guest or grant review permission.

Delivery checks the recipient's own timestamp and business-number match using clock_timestamp(), not the transaction-start time. A ten-second safety margin covers the existing provider request timeout at the end of the 24-hour window. Inside the window, the existing event's configured text is sent. Outside it, an existing applicable kind-specific template is used only if configured. Missing content/template/window schema skips safely with last_error and a delivery-log entry. Unknown provider acceptance is terminal; definitive rate-limit retries retain the existing six-attempt bound.

## Preview activation after explicit approval
Do not apply these settings or migrations during this task.

1. Verify an isolated Preview database and apply migrations/20261013_whatsapp_customer_windows.sql there after approval. Existing WhatsApp schemas and the independent 20261012_whatsapp_preview_test.sql remain required for their respective features.
2. Preview variables:
   - WHATSAPP_ENABLED=true
   - MO_BISTRO_DB=postgres
   - MO_BISTRO_POSTGRES_URL=isolated Preview connection
   - WHATSAPP_WINDOW_TEXT_ENABLED=true
   - WHATSAPP_TEST_RECIPIENT=your personal verified Meta recipient, international format. Automatic Preview delivery is locked to this number and cannot be overridden by client input.
   - META_WHATSAPP_ACCESS_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID, META_GRAPH_API_VERSION
   - META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN
   - WHATSAPP_BUSINESS_NUMBER and WHATSAPP_ASSOCIATION_SECRET (existing subscription configuration)
   - Existing QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY and WHATSAPP_CALLBACK_BASE_URL for the Preview callback endpoint; WHATSAPP_DISPATCH_SECRET for the existing authenticated dispatcher (or its verified QStash callback).
3. Set event text to the same customer-facing wording used by the existing approved messages:
   - WHATSAPP_CONFIRMATION_TEXT
   - WHATSAPP_ALMOST_READY_TEXT
   - WHATSAPP_REVIEW_TEXT
   Supported substitutions: {name}, {booking_id}, {subscribe_command}. Confirmation text must include {subscribe_command} with an explicit invitation to reply for ongoing updates. The opt-out sentence is appended if absent. No new event kinds are created.
4. Keep applicable approved fallback WHATSAPP_CONFIRMATION_TEMPLATE, WHATSAPP_ALMOST_READY_TEMPLATE, WHATSAPP_REVIEW_TEMPLATE and WHATSAPP_TEMPLATE_LANGUAGE configured for sending outside the window. Existing template body parameters/name/booking reference and confirmation quick-reply index 0 remain unchanged.
5. Only after approval to activate real automatic sending, change Preview WHATSAPP_MODE=live and WHATSAPP_ALLOW_LIVE_SEND=true. With the currently required test/false settings, real automatic sending is intentionally impossible.
6. An actual signed incoming message must establish a fresh window; an HTTP 200 alone is not proof. Eligible booking consent/subscription is required independently. Activating the existing dispatcher may process existing eligible jobs; this task did not run it.

## Isolated manual test remains separate
The manual Management test still requires WHATSAPP_MODE=test, WHATSAPP_ALLOW_LIVE_SEND=false, WHATSAPP_PREVIEW_TEST_ENABLED=true and its configured recipient/window. The automatic live profile and manual test profile are mutually exclusive in one deployment; neither bypasses the other's controls.

Management already imported/rendered the test component. Its previous GET swallowed configuration/schema failures as enabled=false and the component returned null. Authorized managers in Preview now see a blocked control with safe setup/schema guidance, and a read-only Check setup button. The actual send stays disabled until setup and the isolated 24-hour window are ready. Outside Preview the control is hidden; endpoint authorization and recipient enforcement are unchanged. A future Preview deployment is required for this local fix. The deployed Preview source SHA was not independently available; remote 8507e49 already contained the earlier integration.

## Verification
Mock-only tests cover open/expired windows, consent and STOP/unsubscribe blocks, recipient mismatch, unavailable schema, disabled sending, duplicate callbacks, delivery logs, unknown/failed providers, rate-limit bounds, monotonic timestamps, and Management visibility. No database-backed tests or migrations are run for this task. TypeScript, lint and build checks are run in test/false mode.

Validation: 55 mock-only regression/security/window tests passed, plus the local rendered browser workflow across five desktop/tablet/mobile widths. Management's blocked test control was visible and disabled; its send action was never clicked. TypeScript and production build passed. ESLint passed for src and tests; repository-wide lint retains six pre-existing no-require-imports errors in four unchanged utility scripts. Browser evidence is in outputs/whatsapp-window-management. No real-provider delivery or Preview database compatibility check was attempted.

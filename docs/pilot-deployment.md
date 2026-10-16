# Queue pilot deployment and testing

## Release stages

- **Development**: pilot at https://development.mo-bistro.labbing.space, branch `pilot/mo-bistro-shrunk`.
- **Preview**: testing deployments from the pilot and advanced branches before release. The existing advanced Preview remains separate.
- **Production**: final release step for either version, after testing and explicit release approval. This change does not promote either version to Production.

The Dev domain names a deployment stage. Vercel Git branch deployments currently inherit its Preview environment variables; Vercel's built-in Development variable scope is for local development. A custom domain alone does not create a new variable scope. No Production variables are changed.

## Scope and preserved code

Only QR/manual join, shared Reception login, arrival-order queue, Notify/Seat guest/removal, private self-refreshing status, one Notify-triggered ready notification, and timestamp CSV are available. Call opens a telephone link without changing status. Legacy pages and APIs remain in source; the pilot proxy blocks them, including scheduled review/ETA jobs, licensing controls and cleanup. Original join/status/login pages are archived in `src/legacy-pages`.

The pilot uses `pilot_parties` and `pilot_ready_messages` in the existing Preview database. Apply `migrations/20261016_queue_pilot.sql` once there. It creates tables only. Full-platform records and automatic cleanup are separate. CSV contains ticket IDs, lifecycle timestamps, party size, preference, source and status; names, phones, tracking tokens and consent information are excluded. CSV timestamps use UTC ISO 8601. More than 50,000 parties requires a follow-up export change; it fails visibly rather than truncating.

## WhatsApp requirements

Notify records `called_at` and creates exactly one durable ready-message job. Neither telephone Call, joining, subscribing nor seating sends another message. Repeated Notify requests cannot create another job. A send with uncertain outcome is not retried automatically. Reception sees Message sent (provider acceptance, not delivery), Sending message, or Message failed; phone Call is prominent when WhatsApp is unavailable. Notify still records the attempted notification time if WhatsApp cannot send.

Retain existing WhatsApp and QStash credentials and the Preview test-recipient restriction. `WHATSAPP_BUSINESS_NUMBER` is the international business number used by the guest's Open WhatsApp link. Guest opt-in is required; staff cannot grant it. The existing full Preview Meta webhook records inbound windows and STOP requests in the shared database. Leave its callback configuration unchanged.

Notify sends a plain-text table-ready message only. It requires explicit booking opt-in, no later STOP request, and a verified inbound message from that phone to this business within the preceding 24 hours (with a ten-second safety margin). `WHATSAPP_WINDOW_TEXT_ENABLED=true` and the existing live-send guards must be enabled. Opt-in on the website does not itself open Meta's service window: the guest must open WhatsApp and send the prepared message. Outside the window, no send or template fallback is attempted; reception shows failure and highlights Call guest. `WHATSAPP_READY_TEMPLATE` is not used by the pilot. The existing Preview recipient allowlist remains enforced. See [Meta's messaging policy](https://whatsappbusiness.com/policy/), section 2.

The QStash ready callback is bound to the Dev domain. Branch previews can test forms/queue/CSV but must not claim independent ready-message delivery; they currently share pilot tables and the Dev callback. Isolated testing environments would require separate records and callback configuration.

## Small-step acceptance test

1. Sign in with the shared staff account. Double-click login: one request, disabled button until navigation. Other staff accounts cannot access pilot APIs. Old management/tables/note/review endpoints return unavailable.
2. Open QR join in a private window; enter the four fields. Invalid phone/size/preference is rejected, repeated active phone gets a clear error, public endpoints are rate-limited. Verify no automatic acknowledgement is created.
3. Add a walk-in. Both parties appear in arrival order with minutes waited; source differs in export. Scan the walk-in private status link if opting into the ready message.
4. From the guest's phone, opt in. Press Notify once in Reception. Reception shows Notified HH:MM; private guest status becomes Called; one ready job exists. In Dev, only the configured test recipient can receive it. Check Reception for sent/failed outcome; sent does not assert delivery. Phone Call only opens `tel:`.
5. Press Seat guest for one party. Open another party's slim drawer: Cancel booking is available before Notify; No-show is available after Notify. Both start a five-second server-stored undo window. Undo restores the active party without exit timestamps or exit reason; repeating removal does not extend the window. After expiry, reads/mutations/export settle the departure at the stored deadline, even if the original browser closed. CSV records `cancelled_before_call` or `no_show_after_call` in `exit_reason`; historical departures remain unclassified. No booking-edit, notes, ETA or audit-history UI is present.
6. Check join/status/queue at mobile width. Retest login, private-link access, CSV authorization and disabled controls on a slow connection.

Before a real two-week trial: agree the trial and success definition with the owner, record a baseline, confirm permitted WhatsApp sending and the guest-initiated conversation flow, and choose a retention period for personal data. This development deployment is not a real trial launch.

## Deployment verification — 16 October 2026

Implementation commit `634a840` passed the Next.js production build, changed-file lint and four migration-backed pilot tests. Vercel deployment `mo-bistro-omuuci1xb-mo-bistro-system.vercel.app` is Ready. Live checks passed shared login (busy button), QR join, walk-in entry, arrival ordering, Call (disabled controls), guest auto-refresh through Called and Seated, Left, CSV download, and blocking the old `/api/guests` endpoint. Preview schema creation and application permissions were verified. Synthetic tickets **1 and 2** are finished test records; exclude them from any trial baseline or results.

The Dev custom domain is assigned to `pilot/mo-bistro-shrunk`. Cloudflare DNS was configured and the HTTPS domain, shared login and join page were verified live. End-to-end delivery of the pilot ready text still needs an opted-in permitted test number with an open service window. No WhatsApp was sent to the synthetic phones.

Desktop appearance was inspected. The browser viewport override returned successfully but continued to report 1280px, so an actual mobile-width visual check remains pending. Responsive CSS is implemented; this is not a claimed mobile acceptance pass. Production and the advanced Preview branch were not changed.

## Reception restyle migration and checks

`migrations/20261016_pilot_reception_actions.sql` was applied to the shared Preview database. It adds removal reason/deadline/token columns to pilot records; no full-platform tables change. Seven isolated migration-backed tests cover lifecycle logging, privacy, auth, Notify idempotency, opt-in plus service-window text delivery, STOP/expired/wrong-business/future-window/disabled-send guards, cancellation/no-show distinction, duplicate requests, valid/invalid/expired undo and withholding messages during an undo window. Waiting duration stays visible until seating; amber starts at 15 minutes and red at 30. The drawer contains only name/status, party, phone, WhatsApp, joined time, primary action, telephone/WhatsApp links and the two removal buttons.

# Queue pilot deployment and testing

## Release stages

- **Development**: pilot at https://development.mo-bistro.labbing.space, branch `pilot/mo-bistro-shrunk`.
- **Preview**: testing deployments from the pilot and advanced branches before release. The existing advanced Preview remains separate.
- **Production**: final release step for either version, after testing and explicit release approval. This change does not promote either version to Production.

The Dev domain names a deployment stage. Vercel Git branch deployments currently inherit its Preview environment variables; Vercel's built-in Development variable scope is for local development. A custom domain alone does not create a new variable scope. No Production variables are changed.

## Scope and preserved code

Only QR/manual join, shared Reception login, arrival-order queue, Call/Seated/Left, private self-refreshing status, one Call-triggered ready notification, and timestamp CSV are available. Legacy pages and APIs remain in source; the pilot proxy blocks them, including scheduled review/ETA jobs, licensing controls and cleanup. Original join/status/login pages are archived in `src/legacy-pages`.

The pilot uses `pilot_parties` and `pilot_ready_messages` in the existing Preview database. Apply `migrations/20261016_queue_pilot.sql` once there. It creates tables only. Full-platform records and automatic cleanup are separate. CSV contains ticket IDs, lifecycle timestamps, party size, preference, source and status; names, phones, tracking tokens and consent information are excluded. CSV timestamps use UTC ISO 8601. More than 50,000 parties requires a follow-up export change; it fails visibly rather than truncating.

## WhatsApp requirements

Call records the called timestamp and creates exactly one durable ready-message job. Neither joining, subscribing nor seating sends any other message. Repeated Call requests cannot create another job. A send with uncertain outcome is not retried automatically. Reception sees failures and must contact the guest directly.

Retain existing WhatsApp and QStash credentials and the Preview test-recipient restriction. `WHATSAPP_BUSINESS_NUMBER` is the international business number used by the guest's Open WhatsApp link. Guest opt-in is required; staff cannot grant it. The existing full Preview Meta webhook records inbound windows and STOP requests in the shared database. Leave its callback configuration unchanged.

Inside a verified 24-hour inbound conversation window, ready text needs `WHATSAPP_WINDOW_TEXT_ENABLED=true`. Outside that window, set `WHATSAPP_READY_TEMPLATE` only to an approved Meta template accepting guest name and ticket number as its two body parameters, with `WHATSAPP_TEMPLATE_LANGUAGE` matching the approval. Without it the send is visibly blocked. This is not permission to remove the test-recipient restriction or send to real guests.

The QStash ready callback is bound to the Dev domain. Branch previews can test forms/queue/CSV but must not claim independent ready-message delivery; they currently share pilot tables and the Dev callback. Isolated testing environments would require separate records and callback configuration.

## Small-step acceptance test

1. Sign in with the shared staff account. Double-click login: one request, disabled button until navigation. Other staff accounts cannot access pilot APIs. Old management/tables/note/review endpoints return unavailable.
2. Open QR join in a private window; enter the four fields. Invalid phone/size/preference is rejected, repeated active phone gets a clear error, public endpoints are rate-limited. Verify no automatic acknowledgement is created.
3. Add a walk-in. Both parties appear in arrival order with minutes waited; source differs in export. Scan the walk-in private status link if opting into the ready message.
4. From the guest's phone, opt in and send the prepared WhatsApp message. Press Call once in Reception. Status changes to Called, one ready job exists. In Dev, only the configured test recipient can receive it. Check Reception for accepted/failed outcome; accepted does not assert delivery.
5. Press Seated for one party and Left for another. They leave the active queue; private status refreshes. Export CSV and check all four timestamps and source, with no names/phones.
6. Check join/status/queue at mobile width. Retest login, private-link access, CSV authorization and disabled controls on a slow connection.

Before a real two-week trial: agree the trial and success definition with the owner, record a baseline, confirm permitted WhatsApp sending and approved templates, and choose a retention period for personal data. This development deployment is not a real trial launch.

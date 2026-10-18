# Reception shared polling

Branch: `feature/reception-shared-polling`, based on `be4e3ce` (Advanced Preview). Pilot and Development are outside this change. No migrations or hosted environment changes.

Reception now has one shared `/api/reception/dashboard` refresh, five seconds after each completed request. It supplies the queue, table inventory, anonymous capacity, pending requests, next-party recommendations and the service strip. Consumers reuse the same private in-memory snapshot instead of fetching those resources separately. Queue and named-table inventory are each selected once per snapshot; next-party choices and counts reuse those rows. Detailed mode uses four data queries; Simple Mode uses five, plus authentication and transaction commands. Settings are included in one batched database read per snapshot to prevent stale mode/confirmation settings when another manager changes them. There are no separate five-second settings requests.

The snapshot transaction is read-only and repeatable-read. Existing flag-gated reminder recovery is preserved after the HTTP response, outside that transaction. This background work is OFF by default and is not counted in the four/five read-query figure. Guest names and phones remain restricted to Manager/Reception sessions with `private, no-store` responses. Session failure clears the cached snapshot and hides Reception until sign-in.

Hidden tabs pause the shared timer and refresh immediately on visibility. Staff actions invalidate the snapshot; a request begun before a mutation cannot publish stale state over its result. Simultaneous readers share a request. Network failures keep the last snapshot, show an updating note, and back off exponentially with jitter. Requests time out after 15 seconds. Unmount stops the timer, aborts the request and clears private data.

The existing detail drawer's booking-specific subscription lookup and the QR dialog's token refresh remain on demand while open. Existing licensing checks are unchanged. Thus the 12/minute figure below describes the normal Reception dashboard, not every possible open dialog or licensing request.

Add guest fields use an explicit contrasting fill, 1px border, minimum 46px height and visible keyboard focus. Verified with the actual rendered component and production CSS at desktop and 390px width; the local fixture uses no customer data or database.

## Checks

- Controlled one-minute polling test: seven readers produce 13 HTTP-fetch calls including the initial load, then 12/minute steady state. This is a deterministic client test, not a hosted traffic capture. Prior independent component intervals implied roughly 90/minute, depending on open panels.
- Client tests cover hidden/resumed tabs, initial and subsequent failures, backoff, overlapping requests, mutation invalidation, stalled requests, authorization failure and teardown.
- Real SQL tests use an isolated in-memory PostgreSQL engine and cover both inventory modes, pending requests, next-party selection, no pilot reads, and no snapshot writes.
- Timing samples are local only. The benchmark prints snapshot p95 and staff-action handler p95 separately; authentication is mocked. These results do not establish hosted latency, Neon connection waiting or cold-start behavior. A hosted comparison remains necessary after this branch deploys.

```sh
node --test tests/reception-feed.test.mjs tests/regressions.test.mjs
node --test tests/advanced-preview.test.mjs tests/postgres-workflows.test.mjs tests/staff-booking-edits.test.mjs
node node_modules/next/dist/bin/next build --webpack
```

For a hosted check, open the new branch's Preview, sign in and clear Network. Filter `/api/reception/dashboard`; leave Reception idle for a minute: expect an initial request plus approximately 12 refreshes. Close QR/detail dialogs for the baseline. Background the tab for 30 seconds: expect no shared polling; return: expect an immediate refresh. Add/call/seat a synthetic party or free a table: all affected panels should update promptly. Simulate one failed/slow poll: existing rows remain visible with the updating note. Repeat in Simple/Detailed Mode and on mobile. Record guest-dashboard and staff-mutation latency separately; do not infer hosting latency from the local benchmark.

WhatsApp preset picker and message wording are proposed separately and are not implemented in this polling change.

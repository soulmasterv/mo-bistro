# Pilot source organization

Pilot is deployed from `Development`. Advanced is deployed from `preview`.
Each uses its own Neon branch and credentials; see `database-environments.md`.

- `src/app/api/pilot/`: authenticated/private handlers and guest booking endpoints.
- `src/lib/pilot/store.ts`: transactional booking state and database operations.
- `src/lib/pilot/whatsapp.ts`: Pilot notification jobs and provider dispatch.
- `src/components/pilot/reception.tsx`: Reception layout, filters, and dialogs.
- `src/components/pilot/use-reception-queue.ts`: one queue polling/mutation owner.
  It retains five-second polling, hidden-tab pause, Retry-After handling, overlap
  prevention, per-guest mutation guards, and refresh generation checks.
- `src/lib/pilot/client-request.ts`: request deadlines, cancellation, event IDs.
- `src/lib/pilot/queue.ts`: shared queue types, subscription/delivery labels, and
  server-clock-adjusted elapsed time. It has no React or stylesheet dependency.
- `queue.tsx`, `guest-drawer.tsx`, `queue-controls.tsx`: queue, details, and shared
  action controls. Phone/subscription details remain inside the drawer.
- `pilot.module.css`: scoped Pilot styles. Selector order is intentional;
  responsive overrides are not interchangeable duplicates.

This cleanup removes unused legacy guest/login screens and two unreferenced
components. Other Advanced modules and API paths remain because historical tests
and compatibility handlers still exercise them. No SQL migration is applied by a
build or by this refactor.

Run `node --test tests/*.test.mjs` using shell-expanded paths on Windows, ESLint,
TypeScript, and `next build`. Browser fixture tests require separate esbuild and
Playwright tools. Fixtures never prove hosted authentication or actual delivery.

# Advanced Preview source organization

## Boundaries

- `src/app`: route entry points, page composition, and route-specific controllers.
- `src/app/api`: HTTP authentication, validation, and responses. Database workflow
  rules belong in `src/lib` rather than being duplicated across handlers.
- `src/components`: shared UI. Reception-specific guest cards and the registration
  QR dialog live under `src/components/reception`.
- `src/lib/reception-queue.ts`: pure queue filtering, position calculation, guest
  types, and display labels. Search does not change arrival positions or who is next.
- `src/lib/reception-feed.ts`: the shared Reception polling owner. Panels subscribe
  to its snapshot rather than creating additional API polling loops.
- `src/lib/reception-snapshot.ts`: read-only database snapshot for that feed.
- `src/lib/whatsapp`: provider, scheduling, consent, and delivery boundaries.
- `migrations`: historical database changes. Do not delete old migrations just
  because their features were removed; existing installations may depend on them.

## Stylesheets

`src/app/globals.css` is the ordered stylesheet entry point. Its six imports separate
foundation, workspaces, staff theme, Reception queue, guest pages, and Reception layout.
Later styles deliberately refine earlier ones. Keep this order until an individual
override has been verified in both themes and responsive layouts. Waiter statistics
still use the shared styles; only the obsolete hidden Reception statistics were removed.

## Checks

Run from this checkout, using its installed Node dependencies:

```powershell
node node_modules/typescript/bin/tsc --noEmit --noUnusedLocals --noUnusedParameters
node node_modules/eslint/bin/eslint.js src tests scripts
node --test --test-concurrency=2 tests/*.test.mjs
node node_modules/next/dist/bin/next build
```

The ordinary tests use mocks, rendering, and in-memory PGlite. The real PostgreSQL
concurrency harness and browser fixtures remain explicitly opt-in; a skipped fixture
is not evidence of a hosted or browser test passing. Never point the concurrency
harness at an application database.

LAN-only configuration and authentication fixtures are separate local work. Review
the diff against `origin/preview` before pushing; this checkout can contain earlier
deployed changes and local-only experiments at the same time.

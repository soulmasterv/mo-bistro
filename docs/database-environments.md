# Database environments

Each deployed version has its own Neon branch in project `summer-cell-27734526`.
Both retain database name `mo_bistro_2` and use `public.guests` for bookings.

| Version | Git branch | Neon branch | Neon branch ID |
| --- | --- | --- | --- |
| Advanced | `preview` | `advanced-preview` | `br-winter-violet-b43c3yc4` |
| Pilot | `Development` | `pilot-development` | `br-quiet-firefly-b420uxon` |

`MO_BISTRO_POSTGRES_URL` must be scoped to the exact Git branch under Vercel
Preview. Keep `RELEASE_SAFETY_EXPECTED_DB_ROLE` set to the matching restricted
application role. Do not substitute the database owner.

The original shared Testing branch is retained as a pre-cutover snapshot.
The Production branch is not part of this migration.

## Migration

Run `20261118_standardize_guests.sql` only on the new Pilot copy. It preserves
Advanced tables under `archived_advanced`, renames Pilot's booking table, and
repairs SQL function bodies. Foreign keys and existing grants follow the table.
Deploy the application rename together with the new connection; old Pilot code
expects `pilot_parties` and cannot use the renamed database.

Advanced's `20261118_isolate_advanced.sql` moves copied Pilot tables to
`archived_pilot` without changing Advanced's booking table.

Archives are preserved data, not active application tables. Other Pilot-specific
table and column names remain unchanged where the implementations differ.

## Rollback

Before new writes, restore the previous branch-scoped connection and previous
deployment together. After new writes, reconcile those records before any
rollback; simply reconnecting the old snapshot would hide newer bookings.
Do not delete the original Testing branch until both environments are verified.

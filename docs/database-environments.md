# Database environments

Each deployed version has its own Neon branch in project `summer-cell-27734526`.
Both retain database name `mo_bistro_2` and use `public.guests` for bookings.

| Version | Git branch | Neon branch | Neon branch ID |
| --- | --- | --- | --- |
| Advanced | `preview` | `Mo-Bistro - Preview` | `br-small-paper-b44l4y84` |
| Pilot | `Development` | `Mo-Bistro - Development` | `br-fragrant-tooth-b4dmo7ge` |

Both are direct children of `Mo-Bistro - Production` (`br-rough-resonance-b4s5laoh`).
Production's database contents are unchanged. Branches do not automatically sync.

`MO_BISTRO_POSTGRES_URL` must be scoped to the exact Git branch under Vercel
Preview. Keep `RELEASE_SAFETY_EXPECTED_DB_ROLE` set to the matching restricted
application role. Do not substitute the database owner.

The earlier Testing-parent branches are retired after the replacement deployments
are verified. Each version's full schema and data were copied using pg_dump and
pg_restore, preserving its booking table, staff records, sequences, and RLS policies.
The restricted `mo_bistro_testing_sql_20261024` login is retained; its credentials
are not stored in this repository. Neon-owned cloud_admin default ACL entries
are managed by Neon and were excluded from the restore.

## Migration

The initial `20261118_standardize_guests.sql` migration ran only on the isolated
Pilot copy. Do not rerun it on the transferred database. It preserves
Advanced tables under `archived_advanced`, renames Pilot's booking table, and
repairs SQL function bodies. Foreign keys and existing grants follow the table.
Old Pilot code expects `pilot_parties` and cannot use the renamed database.

Advanced's `20261118_isolate_advanced.sql` moves copied Pilot tables to
`archived_pilot` without changing Advanced's booking table.

Archives are preserved data, not active application tables. Other Pilot-specific
table and column names remain unchanged where the implementations differ.

## Rollback

After retiring the previous databases, rolling back an app deployment does not
restore a database. Use a verified backup or Neon's available recovery options,
and reconcile any newer records before restoring. In particular, do not point
the deployed Pilot app at a database that still uses `pilot_parties`.

# Advanced Preview feature checks

Scope: `feature/mo-bistro-ui-rebuild` only. No pilot code, Development deployment, or inbound/STOP webhook changes.

All four features require `VERCEL_ENV=preview`, `MO_BISTRO_DB=postgres`, and their own flag set to `true`. Defaults are OFF, including when variables are absent. Production cannot enable these Preview features.

| Feature flag | Check after enabling on Advanced Preview |
| --- | --- |
| `ADV_WA_WAIT_ESTIMATE` | With fewer than 10 seated parties of the same exact party size and seating preference, the acknowledgement stays plain. With 10 matching 25-minute waits, expect “about 20-30 min, an estimate”. Different party sizes do not contribute. A retry reuses its original snapshot. |
| `ADV_WA_REMINDERS` | Subscribe the configured Preview test number through the existing WhatsApp flow. Leave its party Waiting. Expect at most one timer reminder and one next-in-queue reminder. Recheck position 1 twice: one next message. Set the party Called before the timer is due: the timer skips with `not_waiting`. STOP, absent opt-in and a closed business-specific 24-hour window must skip. |
| `ADV_TABLE_OVERRIDE` | Reception sets Indoor/Outdoor available counts. A waiting party highlights only if a matching location has a positive count and a configured table with sufficient capacity. Any-seating parties may fit either location. Zero counts remove highlights. Counts do not reserve or assign tables. |
| `ADV_TABLE_EDITOR` | Manager adds a table, edits its name/capacity/location and deletes it. Reception cannot edit inventory. Occupied or assigned tables cannot change. Simultaneous edits return a refresh conflict. Delete archives the table so historical references remain valid. Check actor and before/after values in `advanced_table_events`. |

Configuration defaults:

```dotenv
ADV_WA_WAIT_ESTIMATE=false
ADV_WA_REMINDERS=false
ADV_TABLE_OVERRIDE=false
ADV_TABLE_EDITOR=false
ADV_WA_HISTORY_LIMIT=50
ADV_WA_MIN_SAMPLES=10
ADV_WA_REMINDER_MINUTES=10
ADV_WA_PRE_NOTIFY_MAX_MESSAGES=3
```

The pre-Notify budget includes the acknowledgement and all other existing non-review notifications while Waiting, plus the two new reminders. Accepted, in-flight and uncertain sends consume budget; definitive failures do not. Reducing the configured budget suppresses further messages; it cannot undo messages already sent. At most two new reminder jobs exist per party regardless of a larger budget. Reminder bodies never include estimates.

The estimate is appended only to the existing permitted free-text acknowledgement inside the verified customer window. Existing approved-template fallbacks remain unchanged; no unapproved template parameters are introduced. Provider acceptance is logged as acceptance, not proof of delivery. `advanced_wait_estimates` stores the cohort count, calculation, copy and acceptance timestamp. Failed/uncertain reminder sends are terminal and recorded in `advanced_reminder_events`; they are not blindly retried.

Timed reminders use a signed QStash callback at `/api/advanced/reminders/jobs`. Existing `QSTASH_*` configuration and `WHATSAPP_CALLBACK_BASE_URL` must point to the Advanced Preview deployment containing that callback. The inbound/STOP webhook configuration stays as-is. Existing live-send gates, Preview test-recipient restriction, opt-in and STOP checks remain enforced. No real messages were sent by automated tests. A scheduling failure records `schedule_failed` and stays pending for the next dispatch; future timers successfully published to QStash do not require the staff tab to remain open. Queue polling and existing booking/seating dispatch paths discover the next party and recover pending publications.

Migration: `migrations/20261018_advanced_preview_features.sql` creates five feature tables and adds archive/revision columns to `restaurant_tables`; no backfill or existing-row mutation. It was committed first on Neon branch `advanced-features-20261018` (`br-billowing-hat-b44za083`), then on shared Preview (`br-misty-king-b4tugm8h`), database `mo_bistro_2`. Both transactions compared all three `pilot_*` tables' row counts/data hashes and column/index/constraint/trigger/policy hashes before/after and asserted equality before commit. The isolated branch expires automatically after one day. Evidence is saved in `outputs/advanced-20261018/isolated-migration.json` and `shared-migration.json` outside the repository.

Automated checks:

```sh
node --test tests/advanced-preview.test.mjs
node --test tests/whatsapp*.test.mjs
node --test tests/postgres-workflows.test.mjs tests/regressions.test.mjs tests/staff-booking-edits.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/next/dist/bin/next build --webpack
```

Keep flags OFF for deployment review. Enable one at a time only on Advanced Preview after verifying the matching database and callback URL. No Production or Development deployment is part of this change.

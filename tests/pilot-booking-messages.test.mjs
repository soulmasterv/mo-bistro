import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHmac } from "node:crypto";
import { load, requireDependency } from "./handler-harness.mjs";
const { PGlite } = requireDependency("@electric-sql/pglite");
const input = {
  name: "Synthetic Guest",
  phone: "01000000001",
  party_size: 2,
  preference: "indoor",
  whatsapp_consent: true,
};

async function setup(overrides = {}) {
  const db = new PGlite();
  for (const file of [
    "20261016_queue_pilot.sql",
    "20261016_pilot_reception_actions.sql",
    "20261017_pilot_measurement.sql",
    "20261118_standardize_guests.sql",
    "20261119_pilot_booking_messages.sql",
  ])
    await db.exec(fs.readFileSync("migrations/" + file, "utf8"));
  await db.exec(
    "CREATE TABLE whatsapp_customer_windows(phone text,phone_number_id text,last_inbound_at timestamptz,UNIQUE(phone,phone_number_id));",
  );
  const adapter = (executor) => {
    const sql = async (strings, ...values) => {
      let q = "";
      strings.forEach((s, i) => {
        q += s;
        if (i < values.length) q += "$" + (i + 1);
      });
      return (await executor.query(q, values)).rows;
    };
    sql.begin = (cb) => db.transaction((tx) => cb(adapter(tx)));
    return sql;
  };
  const env = {
    MO_BISTRO_DB: "postgres",
    VERCEL_ENV: "preview",
    WHATSAPP_ENABLED: "true",
    WHATSAPP_PROVIDER: "kapso",
    KAPSO_PHONE_NUMBER_ID: "456",
    KAPSO_WEBHOOK_SECRET: "synthetic-test-secret",
    WHATSAPP_MODE: "live",
    WHATSAPP_ALLOW_LIVE_SEND: "true",
    WHATSAPP_WINDOW_TEXT_ENABLED: "true",
    WHATSAPP_TEST_RECIPIENT: input.phone,
    WHATSAPP_BUSINESS_NUMBER: '201000000002',
    ...overrides,
  };
  const afters = [],
    sends = [];
  const mocks = {
    "@/lib/postgres-db": { getPostgres: () => adapter(db) },
    "next/server": { after: (fn) => afters.push(fn) },
    "@/lib/whatsapp/transport": {
      requestMetaTemplate: async (payload) => {
        sends.push(payload);
        return { state: "sent", messageId: "wamid." + sends.length };
      },
    },
  };
  const globals = { process: { env } };
  const store = load("src/lib/pilot/store.ts", mocks, globals);
  const messages = load("src/lib/pilot/booking-messages.ts", mocks, globals);
  const webhook = load(
    "src/app/api/pilot/whatsapp/webhook/route.ts",
    mocks,
    globals,
  );
  async function incoming(party, text, phoneId = "456", sign = true) {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: phoneId },
                messages: [
                  {
                    type: "text",
                    from: "201000000001",
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    text: {
                      body:
                        text ??
                        `I'd like to receive booking updates for Mo Bistro pilot ticket #${party.id}.`,
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const headers = sign
      ? {
          "x-webhook-signature": createHmac("sha256", env.KAPSO_WEBHOOK_SECRET)
            .update(body)
            .digest("hex"),
        }
      : {};
    return webhook.POST(
      new Request("https://fixture.test", { method: "POST", body, headers }),
    );
  }
  async function finish() {
    for (const fn of afters.splice(0)) await fn();
  }
  return { db, env, mocks, globals, store, messages, sends, incoming, finish };
}

test("verified Pilot subscription replies once; seating replies once and never marks a waiting guest called", async () => {
  const h = await setup();
  try {
    const p = await h.store.createParty(input, "qr");
    const prepared=new URL(h.store.readyAlertLink(p.id)).searchParams.get('text');
    assert.match(prepared,/receive booking updates/);
    assert.equal((await h.incoming(p, undefined, "456", false)).status, 401);
    await h.incoming(p, undefined, "999");
    assert.equal(h.sends.length, 0);
    assert.equal((await h.incoming(p,prepared)).status, 200);
    await h.incoming(p,prepared);
    await h.finish();
    assert.equal(h.sends.length, 1);
    assert.equal(
      h.sends[0].text.body,
      `You're on the Mo Bistro waitlist (booking #${p.id}). We'll message you here when your table is ready.`,
    );
    assert.equal((await h.store.partyStatus(p.token)).status, "waiting");
    assert.equal(
      (await h.db.query("SELECT * FROM pilot_ready_messages")).rows.length,
      0,
    );
    await h.store.transition(p.id, "seated");
    await h.store.transition(p.id, "seated");
    await h.messages.dispatchPilotBookingMessages(p.id);
    await h.messages.dispatchPilotBookingMessages(p.id);
    assert.equal(h.sends.length, 2);
    assert.equal(
      h.sends[1].text.body,
      "You're seated. Enjoy your meal at Mo Bistro!",
    );
    assert.equal((await h.store.partyStatus(p.token)).status, "seated");
    const jobs = (
      await h.db.query(
        "SELECT kind,status FROM pilot_booking_messages ORDER BY kind",
      )
    ).rows;
    assert.deepEqual(jobs, [
      { kind: "seated", status: "sent" },
      { kind: "subscription", status: "sent" },
    ]);
    await h.incoming(p);
    await h.finish();
    assert.equal(h.sends.length, 2);
  } finally {
    await h.db.close();
  }
});

test("Pilot acknowledgement respects STOP, test recipient, sending mode, and customer window", async () => {
  for (const variant of ["stop", "recipient", "test", "window", "closed"]) {
    const h = await setup();
    try {
      const p = await h.store.createParty(input, "qr");
      await h.incoming(p);
      if (variant === "stop") await h.incoming(p, "STOP");
      if (variant === "recipient")
        h.env.WHATSAPP_TEST_RECIPIENT = "01000000009";
      if (variant === "test") h.env.WHATSAPP_MODE = "test";
      if (variant === "window")
        await h.db.exec(
          "UPDATE whatsapp_customer_windows SET last_inbound_at=NOW()-INTERVAL '25 hours'",
        );
      if (variant === "closed") await h.store.transition(p.id, "cancel");
      await h.finish();
      await h.messages.dispatchPilotBookingMessages(p.id);
      assert.equal(h.sends.length, 0, variant);
      assert.ok(
        ["skipped", "simulated"].includes(
          (await h.db.query("SELECT status FROM pilot_booking_messages"))
            .rows[0].status,
        ),
      );
    } finally {
      await h.db.close();
    }
  }
});

test("older Pilot table-ready subscriptions are acknowledged without expanding their message permission", async () => {
  const h = await setup();
  try {
    const p = await h.store.createParty(input, "qr");
    await h.incoming(
      p,
      `Please send my table-ready message for Mo Bistro pilot ticket #${p.id}.`,
    );
    await h.finish();
    assert.equal(h.sends.length, 1);
    assert.equal(
      (await h.db.query("SELECT whatsapp_seated_consent_at FROM guests"))
        .rows[0].whatsapp_seated_consent_at,
      null,
    );
    await h.store.transition(p.id, "seated");
    await h.messages.dispatchPilotBookingMessages(p.id);
    assert.equal(h.sends.length, 1);
    assert.equal(
      (
        await h.db.query(
          "SELECT * FROM pilot_booking_messages WHERE kind='seated'",
        )
      ).rows.length,
      0,
    );
  } finally {
    await h.db.close();
  }
});

test("unverified Pilot guest gets no seated job, and uncertain acknowledgement is never resent", async () => {
  const h = await setup();
  try {
    const unverified = await h.store.createParty(input, "qr");
    await h.store.transition(unverified.id, "seated");
    assert.equal(
      (await h.db.query("SELECT * FROM pilot_booking_messages")).rows.length,
      0,
    );
    const p = await h.store.createParty(input, "qr");
    h.mocks["@/lib/whatsapp/transport"].requestMetaTemplate = async (
      payload,
    ) => {
      h.sends.push(payload);
      return { state: "unknown", error: "provider_timeout" };
    };
    await h.incoming(p);
    await h.finish();
    await h.incoming(p);
    await h.finish();
    await h.messages.dispatchPilotBookingMessages(p.id);
    assert.equal(h.sends.length, 1);
    assert.equal(
      (await h.db.query("SELECT status FROM pilot_booking_messages")).rows[0]
        .status,
      "unknown",
    );
    await h.store.transition(p.id, "seated");
    await h.db.exec(
      "UPDATE guests SET seated_at=NOW()-INTERVAL '20 minutes' WHERE status='seated'",
    );
    await h.messages.dispatchPilotBookingMessages(p.id);
    assert.equal(
      h.sends.length,
      1,
      "stale seating notices are not sent after recovery",
    );
    assert.equal(
      (
        await h.db.query(
          "SELECT status FROM pilot_booking_messages WHERE kind='seated'",
        )
      ).rows[0].status,
      "skipped",
    );
  } finally {
    await h.db.close();
  }
});

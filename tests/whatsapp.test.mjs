import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { createHmac, randomUUID, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const dependency = createRequire(import.meta.url);
const env = {
  MO_BISTRO_DB: "postgres",
  WHATSAPP_ENABLED: "true",
  WHATSAPP_MODE: "test",
  WHATSAPP_ASSOCIATION_SECRET:
    "isolated-association-secret-at-least-32-characters",
  META_APP_SECRET: "synthetic-meta-app-secret",
  META_WEBHOOK_VERIFY_TOKEN: "synthetic-verify",
  META_WHATSAPP_PHONE_NUMBER_ID: "1234",
  WHATSAPP_BUSINESS_NUMBER: "201000000000",
  WHATSAPP_CONFIRMATION_TEMPLATE: "booking_confirmation",
  WHATSAPP_ALMOST_READY_TEMPLATE: "almost_ready",
  WHATSAPP_REVIEW_TEMPLATE: "review_request",
  WHATSAPP_CALLBACK_BASE_URL: "https://bistro.test",
  QSTASH_CURRENT_SIGNING_KEY: "synthetic-current-signing-key",
  QSTASH_NEXT_SIGNING_KEY: "synthetic-next-signing-key",
};
const database = new PGlite();
await database.exec(
  fs.readFileSync("migrations/001_postgres_schema.sql", "utf8"),
);
await database.exec(
  fs.readFileSync("migrations/20261010_guest_manual_eta.sql", "utf8"),
);
await database.exec(
  fs.readFileSync("migrations/20261012_whatsapp_notifications.sql", "utf8"),
);
await database.exec(fs.readFileSync("migrations/20261012_whatsapp_preview_test.sql", "utf8"));
await database.exec(fs.readFileSync("migrations/20261013_whatsapp_customer_windows.sql", "utf8"));
function sqlAdapter(executor) {
  const sql = async (strings, ...values) => {
    const query = strings.reduce(
      (all, chunk, index) => all + (index ? "$" + index : "") + chunk,
      "",
    );
    // PGlite is a single embedded connection: production advisory locking is not modeled.
    if (query.includes("pg_advisory_xact_lock")) return [];
    return (
      await executor.query(
        query,
        values.map((v) => (v instanceof Date ? v.toISOString() : v)),
      )
    ).rows;
  };
  sql.begin = (callback) =>
    database.transaction((tx) => callback(sqlAdapter(tx)));
  return sql;
}
const sql = sqlAdapter(database),
  cache = new Map(),
  afters = [];
let networkCalls = 0,
  transportFetch = async () => {
    networkCalls++;
    throw Error("Network forbidden in offline test");
  };
function load(file) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule.exports);
  vm.runInNewContext(
    code,
    {
      module: loadedModule,
      exports: loadedModule.exports,
      process: { env },
      console: { error() {} },
      Buffer,
      Date,
      URL,
      Request,
      Response,
      AbortSignal,
      fetch: (...args) => transportFetch(...args),
      require(id) {
        if (id === "server-only") return {};
        if (id === "@/lib/postgres-db") return { getPostgres: () => sql };
        if (id === "@/lib/db") return {};
        if (id === "@/lib/api-rate-limit")
          return { checkRateLimit: async () => null };
        if (id === "@/lib/guest-api-security")
          return {
            rejectCrossOrigin: () => null,
            requireReceptionStaff: async () => null,
          };
        if (id === "@/lib/staff-auth-postgres")
          return {
            getSettingPostgres: async (key, fallback) =>
              key === "qr_required" ? "false" : fallback,
          };
        if (id === "@/lib/staff-auth")
          return {
            getSetting: () => "",
            currentStaff: async () => ({ id: 1, role: "manager" }),
          };
        if (id === "@/lib/qr-origin") return { isAllowedQROrigin: () => true };
        if (id === "@/lib/rotating-qr") return { verifyQR: () => true };
        if (id === "@/lib/guest-eta-support")
          return { hasGuestEtaColumn: async () => true };
        if (id === "@/lib/licensing/enforce")
          return { requireActiveLicense: async () => null };
        if (id === "next/headers")
          return { cookies: async () => ({ get: () => undefined }) };
        if (id === "next/server")
          return {
            NextResponse: { json: (value, init) => Response.json(value, init) },
            after: (fn) => afters.push(fn),
          };
        if (id.startsWith("@/")) return load("src/" + id.slice(2) + ".ts");
        return dependency(id);
      },
    },
    { filename },
  );
  return loadedModule.exports;
}
const policy = load("src/lib/whatsapp/policy.ts"),
  service = load("src/lib/whatsapp/service.ts"),
  webhook = load("src/lib/whatsapp/webhook.ts");
const transport = load("src/lib/whatsapp/transport.ts");
test.after(async () => {
  await database.close();
});
async function reset() {
  await database.exec(
    "TRUNCATE whatsapp_preview_inbound,whatsapp_preview_tests,whatsapp_customer_windows,whatsapp_delivery_logs,whatsapp_inbound_events,whatsapp_notifications,whatsapp_booking_consents,whatsapp_contact_preferences,seating_history,guests,restaurant_tables RESTART IDENTITY CASCADE",
  );
  networkCalls = 0;
  afters.length = 0;
  env.WHATSAPP_ENABLED = "true";
  env.WHATSAPP_MODE = "test";
  delete env.WHATSAPP_ALLOW_LIVE_SEND;
  transportFetch = async () => {
    networkCalls++;
    throw Error("Network forbidden in offline test");
  };
}
async function booking(consent = {}, phone = "01000000000") {
  const token = policy.hashCode(randomUUID()),
    hash = policy.hashCode(token);
  const [guest] =
    await sql`INSERT INTO guests(name,phone,party_size,tracking_token_hash,seating_preference)
    VALUES ('Audit Guest',${phone},2,${hash},'indoor') RETURNING id`;
  await sql.begin((tx) =>
    service.recordBookingConsent(tx, guest.id, phone, hash, consent),
  );
  return {
    id: guest.id,
    token,
    code: policy.subscriptionCode(guest.id, hash),
    phone: policy.normalizePhone(phone),
  };
}
function envelope(message) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "1234" },
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}
function inbound(b, id = randomUUID(), extra = {}) {
  return {
    id,
    from: b.phone,
    timestamp: String(Math.ceil(Date.now() / 1000)),
    type: "text",
    text: { body: `SUBSCRIBE ${b.id} ${b.code}` },
    ...extra,
  };
}
async function jobs(kind) {
  return (
    await database.query("SELECT * FROM whatsapp_notifications ORDER BY kind")
  ).rows.filter(row => !kind || row.kind === kind);
}
const cases = [];
function check(name, fn) {
  cases.push([name, fn]);
}
check(
  "feature disabled by default: no consent DB calls or provider sends",
  async () => {
    delete env.WHATSAPP_ENABLED;
    assert.equal(policy.whatsappEnabled(), false);
    await service.recordBookingConsent(null, 1, "01000000000", "hash", {});
    await service.dispatchOutbox();
    assert.equal(networkCalls, 0);
  },
);
check(
  "actual booking POST records consent and queues confirmation atomically",
  async () => {
    const route = load("src/app/api/join/route.ts");
    const response = await route.POST(
      new Request("https://bistro.test/api/join", {
        method: "POST",
        body: JSON.stringify({
          name: "Audit Guest",
          phone: "01000000000",
          party_size: 2,
          whatsapp_confirmation_consent: true,
        }),
      }),
    );
    assert.equal(response.status, 201);
    assert.equal((await jobs()).length, 1);
    const state = await database.query(
      "SELECT confirmation_consent,subscribed_at FROM whatsapp_booking_consents",
    );
    assert.equal(state.rows[0].confirmation_consent, true);
    assert.equal(state.rows[0].subscribed_at, null);
    assert.equal(networkCalls, 0);
    assert.equal(afters.length, 1);
  },
);
check(
  "no confirmation consent creates association but no notification",
  async () => {
    const b = await booking();
    assert.equal((await jobs()).length, 0);
    const state = await service.subscriptionState(b.token);
    assert.equal(state.available, true);
    assert.equal(state.subscribed, false);
    assert.match(decodeURIComponent(state.url),/I'd like to receive updates about booking \d+\.\nCode: [a-z]{4}-\d{4}$/);
    await service.subscriptionState(b.token);
    assert.equal((await jobs()).length, 0);
  },
);
check(
  "test-mode confirmation is simulated once and has Subscribe to Updates payload",
  async () => {
    const b = await booking({ whatsapp_confirmation_consent: true });
    await service.dispatchOutbox();
    const [job] = await jobs();
    assert.equal(job.status, "simulated");
    assert.equal(networkCalls, 0);
    assert.equal(
      await service.deliverNotification(job.id, job.revision),
      "done",
    );
    assert.equal(
      (await database.query("SELECT * FROM whatsapp_delivery_logs")).rows
        .length,
      1,
    );
    const payload = transport.templatePayload(
      { id: job.id, kind: "confirmation", guest_id: b.id },
      { phone: b.phone, name: "Audit Guest" },
      b.code,
    );
    assert.equal(
      payload.template.components[1].parameters[0].payload,
      `subscribe:${b.id}:${b.code}`,
    );
  },
);
check(
  "subscription activates only on received matching text, not link access",
  async () => {
    const b = await booking();
    assert.equal((await service.subscriptionState(b.token)).subscribed, false);
    await webhook.processMetaWebhook(envelope(inbound(b, "msg-subscribe")));
    assert.equal((await service.subscriptionState(b.token)).subscribed, true);
    await webhook.processMetaWebhook(envelope(inbound(b, "msg-subscribe")));
    assert.equal(
      (await database.query("SELECT * FROM whatsapp_inbound_events")).rows
        .length,
      1,
    );
  },
);
check(
  "wrong sender/code/booking and wrong business phone cannot subscribe",
  async () => {
    const b = await booking();
    for (const message of [
      inbound(b, "wrong-phone", { from: "201111111111" }),
      inbound(b, "wrong-code", {
        text: { body: `SUBSCRIBE ${b.id} ${"b".repeat(64)}` },
      }),
      inbound(b, "wrong-id", { text: { body: `SUBSCRIBE 999 ${b.code}` } }),
    ])
      await webhook.processMetaWebhook(envelope(message));
    const payload = envelope(inbound(b));
    payload.entry[0].changes[0].value.metadata.phone_number_id = "999";
    await webhook.processMetaWebhook(payload);
    assert.equal((await service.subscriptionState(b.token)).subscribed, false);
  },
);
check(
  "quick-reply must reference the correct booking confirmation message",
  async () => {
    const b = await booking({ whatsapp_confirmation_consent: true });
    await database.query(
      "UPDATE whatsapp_notifications SET status='sent',provider_message_id='wamid.confirm'",
    );
    await webhook.processMetaWebhook(
      envelope(
        inbound(b, "wrong-context", {
          type: "button",
          button: { payload: `subscribe:${b.id}:${b.code}` },
          context: { id: "wamid.other" },
        }),
      ),
    );
    assert.equal((await service.subscriptionState(b.token)).subscribed, false);
    await webhook.processMetaWebhook(
      envelope(
        inbound(b, "correct-context", {
          type: "button",
          button: { payload: `subscribe:${b.id}:${b.code}` },
          context: { id: "wamid.confirm" },
        }),
      ),
    );
    assert.equal((await service.subscriptionState(b.token)).subscribed, true);
  },
);
check("expired subscription code fails closed", async () => {
  const b = await booking();
  await database.query(
    "UPDATE whatsapp_booking_consents SET subscription_expires_at=NOW()-INTERVAL '1 second'",
  );
  await webhook.processMetaWebhook(envelope(inbound(b)));
  assert.equal((await service.subscriptionState(b.token)).subscribed, false);
});
check("cancelled booking cannot subscribe", async () => {
  const b = await booking();
  await database.query("UPDATE guests SET status='cancelled'");
  await webhook.processMetaWebhook(envelope(inbound(b)));
  assert.equal((await service.subscriptionState(b.token)).subscribed, false);
});
check(
  "missing association secret rolls back booking and consent transaction",
  async () => {
    const secret = env.WHATSAPP_ASSOCIATION_SECRET;
    delete env.WHATSAPP_ASSOCIATION_SECRET;
    try {
      const route = load("src/app/api/join/route.ts");
      const response = await route.POST(
        new Request("https://bistro.test/api/join", {
          method: "POST",
          body: JSON.stringify({
            name: "Audit Guest",
            phone: "01000000000",
            party_size: 2,
            whatsapp_confirmation_consent: true,
          }),
        }),
      );
      assert.equal(response.status, 500);
      assert.equal(
        (await database.query("SELECT * FROM guests")).rows.length,
        0,
      );
      assert.equal((await jobs()).length, 0);
    } finally {
      env.WHATSAPP_ASSOCIATION_SECRET = secret;
    }
  },
);
check(
  "STOP applies across all sender bookings and stale subscription replay cannot reactivate",
  async () => {
    const a = await booking(),
      b = await booking();
    await webhook.processMetaWebhook(envelope(inbound(a)));
    await webhook.processMetaWebhook(envelope(inbound(b)));
    await webhook.processMetaWebhook(
      envelope(inbound(a, "global-stop", { text: { body: "unsubscribe" } })),
    );
    assert.equal((await service.subscriptionState(a.token)).subscribed, false);
    assert.equal((await service.subscriptionState(b.token)).subscribed, false);
    await webhook.processMetaWebhook(
      envelope(
        inbound(a, "old-subscribe", {
          timestamp: String(Math.floor(Date.now() / 1000) - 60),
        }),
      ),
    );
    assert.equal((await service.subscriptionState(a.token)).subscribed, false);
  },
);
check(
  "STOP suppresses queued notifications and resets feedback consent",
  async () => {
    const b = await booking({ whatsapp_feedback_consent: true });
    await webhook.processMetaWebhook(envelope(inbound(b)));
    await sql.begin((tx) =>
      service.scheduleAlmostReady(tx, b.id, new Date(Date.now() + 20 * 60000)),
    );
    await webhook.processMetaWebhook(
      envelope(inbound(b, "stop", { text: { body: "STOP" } })),
    );
    assert.equal((await jobs())[0].status, "skipped");
    assert.equal((await service.subscriptionState(b.token)).subscribed, false);
    assert.equal(
      (await service.subscriptionState(b.token)).feedbackConsent,
      false,
    );
    await service.dispatchOutbox();
    assert.equal(networkCalls, 0);
  },
);
check(
  "almost-ready requires reply and schedules ETA minus 10 minutes once",
  async () => {
    const b = await booking();
    const eta = new Date(Date.now() + 20 * 60000);
    await sql`UPDATE guests SET eta_at=${eta} WHERE id=${b.id}`;
    await sql.begin((tx) => service.scheduleAlmostReady(tx, b.id, eta));
    assert.equal((await jobs()).length, 0);
    await webhook.processMetaWebhook(envelope(inbound(b)));
    let [job] = await jobs();
    assert.equal(new Date(job.due_at).getTime(), eta.getTime() - 600000);
    await database.query(
      "UPDATE whatsapp_notifications SET due_at=NOW()-INTERVAL '1 second'",
    );
    await database.query("UPDATE guests SET eta_at=NOW()+INTERVAL '5 minutes'");
    await service.dispatchOutbox();
    assert.equal((await jobs())[0].status, "simulated");
    await sql.begin((tx) =>
      service.scheduleAlmostReady(tx, b.id, new Date(Date.now() + 25 * 60000)),
    );
    assert.equal((await jobs())[0].status, "simulated");
  },
);
check(
  "ETA revision invalidates old QStash callback and clear suppresses job",
  async () => {
    const b = await booking();
    await webhook.processMetaWebhook(envelope(inbound(b)));
    await sql.begin((tx) =>
      service.scheduleAlmostReady(tx, b.id, new Date(Date.now() + 20 * 60000)),
    );
    const [old] = await jobs();
    await sql.begin((tx) =>
      service.scheduleAlmostReady(tx, b.id, new Date(Date.now() + 30 * 60000)),
    );
    assert.equal(
      await service.deliverNotification(old.id, old.revision),
      "done",
    );
    assert.equal((await jobs())[0].status, "pending");
    await sql.begin((tx) => service.scheduleAlmostReady(tx, b.id, null));
    assert.equal((await jobs())[0].status, "skipped");
  },
);
check(
  "review scheduled at seated_at + 60 minutes only for subscriber with feedback consent",
  async () => {
    const b = await booking({ whatsapp_feedback_consent: true });
    const seated = new Date(Date.now() - 120000);
    await sql.begin((tx) => service.scheduleReview(tx, b.id, seated));
    assert.equal((await jobs()).length, 0);
    await webhook.processMetaWebhook(envelope(inbound(b)));
    await sql.begin((tx) => service.scheduleReview(tx, b.id, seated));
    const [job] = await jobs("review");
    assert.equal(new Date(job.due_at).getTime(), seated.getTime() + 3600000);
    await database.query(
      "UPDATE guests SET status='seated',seated_at=NOW()-INTERVAL '61 minutes'",
    );
    await database.query(
      "UPDATE whatsapp_notifications SET due_at=NOW()-INTERVAL '1 second'",
    );
    await service.dispatchOutbox();
    assert.equal((await jobs("review"))[0].status, "simulated");
    await service.dispatchOutbox();
    assert.equal(
      (await database.query("SELECT l.* FROM whatsapp_delivery_logs l JOIN whatsapp_notifications n ON n.id=l.notification_id WHERE n.kind='review'")).rows
        .length,
      1,
    );
  },
);
check(
  "review never queues for subscriber without feedback permission",
  async () => {
    const b = await booking();
    await webhook.processMetaWebhook(envelope(inbound(b)));
    await sql.begin((tx) => service.scheduleReview(tx, b.id, new Date()));
    assert.equal((await jobs("review")).length, 0);
  },
);
check(
  "seating transaction stamps seated_at and schedules review without table release changing it",
  async () => {
    const b = await booking({ whatsapp_feedback_consent: true });
    await webhook.processMetaWebhook(envelope(inbound(b)));
    await database.query(
      "INSERT INTO restaurant_tables(name,seats,area) VALUES ('T1',4,'indoor')",
    );
    const seating = load("src/lib/seating-postgres.ts");
    await seating.assignTablePostgres(b.id, 1);
    const [guest] = (await database.query("SELECT seated_at FROM guests")).rows;
    const [review] = await jobs("review");
    assert.equal(
      new Date(review.due_at).getTime(),
      new Date(guest.seated_at).getTime() + 3600000,
    );
    await database.exec(
      fs.readFileSync("migrations/20261010_table_ready_requests.sql", "utf8"),
    );
    await seating.releaseTablePostgres(1);
    assert.equal(
      String(
        (await database.query("SELECT seated_at FROM guests")).rows[0]
          .seated_at,
      ),
      String(guest.seated_at),
    );
  },
);
check("delivery-time consent/status change blocks pending sends", async () => {
  await booking({ whatsapp_confirmation_consent: true });
  await database.query("UPDATE guests SET status='cancelled'");
  await service.dispatchOutbox();
  assert.equal((await jobs())[0].status, "skipped");
  assert.equal(networkCalls, 0);
});
check(
  "signed Meta webhook rejects tamper; handshake and routes never opt-in without signature",
  async () => {
    const b = await booking();
    const route = load("src/app/api/whatsapp/webhook/route.ts");
    const raw = JSON.stringify(envelope(inbound(b)));
    const signed = `sha256=${createHmac("sha256", env.META_APP_SECRET).update(raw).digest("hex")}`;
    assert.equal(policy.verifyMetaSignature(raw, signed), true);
    assert.equal(policy.verifyMetaSignature(raw + " ", signed), false);
    assert.equal(
      (
        await route.POST(
          new Request("https://bistro.test/api/whatsapp/webhook", {
            method: "POST",
            body: raw,
          }),
        )
      ).status,
      401,
    );
    assert.equal((await service.subscriptionState(b.token)).subscribed, false);
    assert.equal(
      (
        await route.POST(
          new Request("https://bistro.test/api/whatsapp/webhook", {
            method: "POST",
            body: raw,
            headers: { "x-hub-signature-256": signed },
          }),
        )
      ).status,
      200,
    );
    assert.equal((await service.subscriptionState(b.token)).subscribed, true);
    assert.equal(
      await (
        await route.GET(
          new Request(
            "https://bistro.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=synthetic-verify&hub.challenge=123",
          ),
        )
      ).text(),
      "123",
    );
  },
);
check(
  "QStash signature checks body, canonical callback URL, expiry and rotation keys",
  async () => {
    const jose = createRequire(dependency.resolve("@upstash/qstash"))("jose");
    const body = JSON.stringify({ notificationId: randomUUID(), revision: 1 });
    const claims = {
      iss: "Upstash",
      sub: "https://bistro.test/api/whatsapp/jobs",
      body: createHash("sha256").update(body).digest("base64url"),
    };
    const sign = (key, sub = claims.sub, exp = "2m") =>
      new jose.SignJWT({ ...claims, sub })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setNotBefore("0s")
        .setExpirationTime(exp)
        .sign(new TextEncoder().encode(key));
    assert.equal(
      await transport.verifyQstash(
        body,
        await sign(env.QSTASH_CURRENT_SIGNING_KEY),
        "/api/whatsapp/jobs",
      ),
      true,
    );
    assert.equal(
      await transport.verifyQstash(
        body,
        await sign(env.QSTASH_NEXT_SIGNING_KEY),
        "/api/whatsapp/jobs",
      ),
      true,
    );
    assert.equal(
      await transport.verifyQstash(
        body + " ",
        await sign(env.QSTASH_CURRENT_SIGNING_KEY),
        "/api/whatsapp/jobs",
      ),
      false,
    );
    assert.equal(
      await transport.verifyQstash(
        body,
        await sign(env.QSTASH_CURRENT_SIGNING_KEY, "https://wrong.test/jobs"),
        "/api/whatsapp/jobs",
      ),
      false,
    );
    assert.equal(
      await transport.verifyQstash(
        body,
        await sign(env.QSTASH_CURRENT_SIGNING_KEY, claims.sub, "-2m"),
        "/api/whatsapp/jobs",
      ),
      false,
    );
  },
);
check(
  "jobs/dispatcher callbacks deny unsigned or unauthenticated requests",
  async () => {
    for (const route of ["jobs", "dispatch"])
      assert.equal(
        (
          await load(`src/app/api/whatsapp/${route}/route.ts`).POST(
            new Request("https://bistro.test/api/whatsapp/" + route, {
              method: "POST",
              body: "{}",
            }),
          )
        ).status,
        401,
      );
  },
);
check(
  "live flag without explicit allow remains safe and Meta timeout is unknown, never blindly retried",
  async () => {
    env.WHATSAPP_MODE = "live";
    const b = await booking({ whatsapp_confirmation_consent: true });
    await service.dispatchOutbox();
    assert.equal(networkCalls, 0);
    const payload = transport.templatePayload(
      { id: randomUUID(), guest_id: b.id, kind: "confirmation" },
      { name: "Audit Guest", phone: b.phone },
      b.code,
    );
    env.WHATSAPP_ALLOW_LIVE_SEND = "true";
    env.META_WHATSAPP_ACCESS_TOKEN = "synthetic-access";
    env.META_GRAPH_API_VERSION = "v23.0";
    assert.equal((await transport.sendTemplate(payload)).state, "unknown");
    assert.equal(networkCalls, 1);
  },
);
check(
  "Meta delivery statuses deduplicate and reconcile unknown acceptance",
  async () => {
    await booking({ whatsapp_confirmation_consent: true });
    const [job] = await jobs();
    await database.query("UPDATE whatsapp_notifications SET status='unknown'");
    const payload = envelope(
      inbound({ id: 1, phone: "201000000000", code: "a".repeat(64) }),
    );
    payload.entry[0].changes[0].value.messages = [];
    payload.entry[0].changes[0].value.statuses = [
      {
        id: "wamid.result",
        status: "delivered",
        timestamp: String(Math.floor(Date.now() / 1000)),
        biz_opaque_callback_data: job.id,
      },
    ];
    await webhook.processMetaWebhook(payload);
    await webhook.processMetaWebhook(payload);
    assert.equal((await jobs())[0].status, "sent");
    assert.equal(
      (await database.query("SELECT * FROM whatsapp_delivery_logs")).rows
        .length,
      1,
    );
  },
);
check('scheduler rejection is recorded safely without claiming a Meta send or losing the pending job',async()=>{
  env.WHATSAPP_MODE='live';env.WHATSAPP_ALLOW_LIVE_SEND='true';env.QSTASH_TOKEN='synthetic-scheduler-token';
  await booking({whatsapp_confirmation_consent:true});
  transportFetch=async()=>{networkCalls++;return new Response('private-provider-error',{status:401});};
  await service.dispatchOutbox();
  const [job]=await jobs();
  assert.equal(job.status,'pending');assert.equal(job.last_error,'scheduler_http_401');
  assert.equal(job.attempts,0);assert.equal(job.qstash_message_id,null);assert.equal(job.provider_message_id,null);
  assert.equal(networkCalls,1);
});
check(
  "feedback preference route does not subscribe and rejects malformed token",
  async () => {
    const b = await booking();
    const route = load("src/app/api/whatsapp/subscription/route.ts");
    const request = (data) =>
      new Request("https://bistro.test/api/whatsapp/subscription", {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    assert.equal(
      (await route.PATCH(request({ token: "bad", feedbackConsent: true })))
        .status,
      400,
    );
    assert.equal(
      (await route.PATCH(request({ token: b.token, feedbackConsent: true })))
        .status,
      200,
    );
    const state = await service.subscriptionState(b.token);
    assert.equal(state.subscribed, false);
    assert.equal(state.feedbackConsent, true);
  },
);
check(
  "live adapter mock emits exactly one template across duplicate callbacks",
  async () => {
    await booking({ whatsapp_confirmation_consent: true });
    env.WHATSAPP_MODE = "live";
    env.WHATSAPP_ALLOW_LIVE_SEND = "true";
    env.META_WHATSAPP_ACCESS_TOKEN = "synthetic-access";
    env.META_GRAPH_API_VERSION = "v23.0";
    env.QSTASH_TOKEN = "synthetic-qstash";
    const calls = [];
    transportFetch = async (url, init) => {
      calls.push({ url, init });
      return Response.json(
        url.includes("upstash.io")
          ? { messageId: "qstash-test" }
          : { messages: [{ id: "wamid.offline" }] },
      );
    };
    await service.dispatchOutbox();
    const [job] = await jobs();
    assert.equal(job.status, "scheduled");
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].init.headers["Upstash-Deduplication-Id"],
      `${job.id}-${job.revision}`,
    );
    assert.equal(
      await service.deliverNotification(job.id, job.revision),
      "done",
    );
    assert.equal(
      await service.deliverNotification(job.id, job.revision),
      "done",
    );
    assert.equal(
      calls.filter((x) => x.url.includes("graph.facebook.com")).length,
      1,
    );
    assert.equal((await jobs())[0].status, "sent");
  },
);
check(
  "uncertain Meta acceptance is terminal until signed status reconciliation, never a resend",
  async () => {
    await booking({ whatsapp_confirmation_consent: true });
    const [job] = await jobs();
    env.WHATSAPP_MODE = "live";
    env.WHATSAPP_ALLOW_LIVE_SEND = "true";
    env.META_WHATSAPP_ACCESS_TOKEN = "synthetic-access";
    env.META_GRAPH_API_VERSION = "v23.0";
    assert.equal(
      await service.deliverNotification(job.id, job.revision),
      "done",
    );
    assert.equal((await jobs())[0].status, "unknown");
    assert.equal(networkCalls, 1);
    await service.deliverNotification(job.id, job.revision);
    assert.equal(networkCalls, 1);
  },
);
check(
  "definitive Meta 429 retries safely, bounded to six attempts",
  async () => {
    await booking({ whatsapp_confirmation_consent: true });
    const [job] = await jobs();
    env.WHATSAPP_MODE = "live";
    env.WHATSAPP_ALLOW_LIVE_SEND = "true";
    env.META_WHATSAPP_ACCESS_TOKEN = "synthetic-access";
    env.META_GRAPH_API_VERSION = "v23.0";
    let sent = 0;
    transportFetch = async () => {
      sent++;
      return Response.json({ error: { code: 130429 } }, { status: 429 });
    };
    for (let i = 0; i < 6; i++)
      assert.equal(
        await service.deliverNotification(job.id, job.revision),
        i === 5 ? "done" : "retry",
      );
    assert.equal((await jobs())[0].status, "failed");
    await service.deliverNotification(job.id, job.revision);
    assert.equal(sent, 6);
  },
);
check("new ETA delays existing callback without sending early", async () => {
  const b = await booking({ whatsapp_feedback_consent: true });
  await webhook.processMetaWebhook(envelope(inbound(b)));
  const eta = new Date(Date.now() + 5 * 60000);
  await sql`UPDATE guests SET eta_at=${eta}`;
  await sql.begin((tx) => service.scheduleAlmostReady(tx, b.id, eta));
  const [job] = await jobs();
  await sql`UPDATE guests SET eta_at=${new Date(Date.now() + 25 * 60000)}`;
  await service.deliverNotification(job.id, job.revision);
  assert.equal((await jobs())[0].revision, job.revision + 1);
  assert.equal((await jobs())[0].status, "pending");
  assert.equal(networkCalls, 0);
});
check(
  "revoked feedback suppresses due review and signed duplicate job route is idempotent",
  async () => {
    const b = await booking({ whatsapp_feedback_consent: true });
    await webhook.processMetaWebhook(envelope(inbound(b)));
    await sql`UPDATE guests SET status='seated',seated_at=${new Date(Date.now() - 61 * 60000)}`;
    await sql.begin((tx) => service.scheduleReview(tx, b.id, new Date()));
    await database.query(
      "UPDATE whatsapp_notifications SET due_at=NOW()-INTERVAL '1 second'",
    );
    const [job] = await jobs();
    await sql`UPDATE whatsapp_booking_consents SET feedback_consent=FALSE`;
    const route = load("src/app/api/whatsapp/jobs/route.ts"),
      jose = createRequire(dependency.resolve("@upstash/qstash"))("jose");
    const raw = JSON.stringify({
      notificationId: job.id,
      revision: job.revision,
    });
    const signature = await new jose.SignJWT({
      iss: "Upstash",
      sub: "https://bistro.test/api/whatsapp/jobs",
      body: createHash("sha256").update(raw).digest("base64url"),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setNotBefore("0s")
      .setExpirationTime("2m")
      .sign(new TextEncoder().encode(env.QSTASH_CURRENT_SIGNING_KEY));
    const req = () =>
      new Request("https://bistro.test/api/whatsapp/jobs", {
        method: "POST",
        body: raw,
        headers: { "upstash-signature": signature },
      });
    assert.equal((await route.POST(req())).status, 200);
    assert.equal((await jobs())[0].status, "skipped");
    assert.equal((await route.POST(req())).status, 200);
    assert.equal(networkCalls, 0);
  },
);
check(
  "drain recovers exhausted unclaimed jobs but does not resend uncertain sends",
  async () => {
    await booking({ whatsapp_confirmation_consent: true });
    await database.query(
      "UPDATE whatsapp_notifications SET status='scheduled',due_at=NOW()-INTERVAL '6 minutes',updated_at=NOW()-INTERVAL '6 minutes'",
    );
    const [old] = await jobs();
    await service.dispatchOutbox();
    const [next] = await jobs();
    assert.equal(next.status, "simulated");
    assert.equal(next.revision, old.revision + 1);
    await database.query(
      "UPDATE whatsapp_notifications SET status='sending',updated_at=NOW()-INTERVAL '3 minutes'",
    );
    await service.dispatchOutbox();
    assert.equal((await jobs())[0].status, "unknown");
    assert.equal(networkCalls, 0);
  },
);
check(
  "late subscription/feedback never creates a new review after the 60-minute window",
  async () => {
    const b = await booking({ whatsapp_feedback_consent: true });
    await sql`UPDATE guests SET status='seated',seated_at=${new Date(Date.now() - 61 * 60000)}`;
    await webhook.processMetaWebhook(envelope(inbound(b)));
    assert.equal((await jobs()).length, 0);
  },
);
check(
  "Simple Mode seating retains WhatsApp timestamp and review scheduling",
  async () => {
    const b = await booking({ whatsapp_feedback_consent: true });
    await webhook.processMetaWebhook(envelope(inbound(b)));
    await database.exec(
      "INSERT INTO staff_users(username,role,credential_hash) VALUES ('manager','manager','fixture') ON CONFLICT DO NOTHING;",
    );
    await database.exec(
      fs.readFileSync("migrations/20261012_simple_inventory.sql", "utf8"),
    );
    await database.exec(
      "UPDATE simple_table_capacity SET total_tables=2,max_party_size=6,occupied_tables=0; INSERT INTO seating_settings(key,value) VALUES ('table_view_mode','simple') ON CONFLICT(key) DO UPDATE SET value='simple';",
    );
    const simple = load("src/lib/simple-table-postgres.ts");
    await simple.assignSimpleTable(b.id, "indoor", 1);
    const [guest] = (await database.query("SELECT seated_at FROM guests")).rows;
    const [review] = await jobs("review");
    assert.ok(guest.seated_at);
    assert.equal(
      new Date(review.due_at).getTime(),
      new Date(guest.seated_at).getTime() + 3600000,
    );
  },
);
async function isolatedConsentCase(fn) {
  const values={VERCEL_ENV:'preview',WHATSAPP_PREVIEW_TEST_ENABLED:'true',WHATSAPP_TEST_RECIPIENT:'201000000000',WHATSAPP_WINDOW_TEXT_ENABLED:'true',WHATSAPP_ALLOW_LIVE_SEND:'false'};
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,env[key]]));
  Object.assign(env,values);
  try { await fn(); }
  finally {for(const key of Object.keys(values)) {if(previous[key]===undefined)delete env[key];else env[key]=previous[key];}}
}
async function signedPreviewMessage(message,valid=true,business='1234') {
  const payload=envelope(message);payload.entry[0].changes[0].value.metadata.phone_number_id=business;
  const raw=JSON.stringify(payload);
  const signature='sha256='+createHmac('sha256',env.META_APP_SECRET).update(raw).digest('hex');
  return load('src/app/api/whatsapp/webhook/route.ts').POST(new Request('https://bistro.test/api/whatsapp/webhook',{
    method:'POST',headers:{'x-hub-signature-256':valid?signature:'sha256='+'0'.repeat(64)},body:raw,
  }));
}
check('isolated Preview records hello without consent, accepts owned signed SUBSCRIBE once and never dispatches',async()=>isolatedConsentCase(async()=>{
  const b=await booking({whatsapp_confirmation_consent:true});
  const make=(id,body)=>inbound(b,id,{timestamp:String(Math.floor(Date.now()/1000)-1),text:{body}});
  assert.equal((await signedPreviewMessage(make('test-hello','Hello'))).status,200);
  assert.equal((await service.subscriptionState(b.token)).subscribed,false);
  assert.equal((await database.query('SELECT count(*) AS n FROM whatsapp_inbound_events')).rows[0].n,0);
  const message=make('test-owned-subscribe',`SUBSCRIBE ${b.id} ${b.code}`);
  assert.equal((await signedPreviewMessage(message)).status,200);
  assert.equal((await service.subscriptionState(b.token)).subscribed,true);
  assert.equal((await signedPreviewMessage(message)).status,200);
  assert.equal((await database.query('SELECT count(*) AS n FROM whatsapp_inbound_events')).rows[0].n,1);
  assert.equal((await database.query('SELECT count(*) AS n FROM whatsapp_preview_inbound')).rows[0].n,2);
  assert.equal((await jobs())[0].status,'pending');assert.equal((await jobs())[0].attempts,0);
  assert.equal(afters.length,0);assert.equal(networkCalls,0);
}));
check('isolated Preview subscription still rejects unsigned, wrong-business, forged-code, wrong-phone and expired commands',async()=>isolatedConsentCase(async()=>{
  const b=await booking();
  assert.equal((await signedPreviewMessage(inbound(b),false)).status,401);
  assert.equal((await signedPreviewMessage(inbound(b),true,'other-business')).status,200);
  assert.equal((await signedPreviewMessage(inbound(b,randomUUID(),{text:{body:`SUBSCRIBE ${b.id} ${'0'.repeat(64)}`}}))).status,200);
  assert.equal((await signedPreviewMessage(inbound(b,randomUUID(),{from:'201000000001'}))).status,200);
  await sql`UPDATE whatsapp_booking_consents SET subscription_expires_at=NOW()-INTERVAL '1 minute' WHERE guest_id=${b.id}`;
  assert.equal((await signedPreviewMessage(inbound(b))).status,200);
  assert.equal((await service.subscriptionState(b.token)).subscribed,false);
  assert.equal((await database.query("SELECT count(*) AS n FROM whatsapp_inbound_events WHERE action='subscribe'")).rows[0].n,0);
  assert.equal(afters.length,0);assert.equal(networkCalls,0);
}));
check('isolated Preview respects mixed-case STOP and UNSUBSCRIBE and invalidates pending notifications',async()=>isolatedConsentCase(async()=>{
  const b=await booking({whatsapp_confirmation_consent:true,whatsapp_feedback_consent:true});
  for(const command of ['sToP','UnSuBsCrIbE']) {
    await sql`UPDATE whatsapp_contact_preferences SET opted_out_at=NULL WHERE phone=${b.phone}`;
    assert.equal((await signedPreviewMessage(inbound(b))).status,200);
    assert.equal((await service.subscriptionState(b.token)).subscribed,true);
    assert.equal((await signedPreviewMessage(inbound(b,randomUUID(),{text:{body:command}}))).status,200);
    assert.equal((await service.subscriptionState(b.token)).subscribed,false);
    assert.equal((await service.subscriptionState(b.token)).feedbackConsent,false);
    assert.equal((await jobs())[0].status,'skipped');
  }
  assert.equal(afters.length,0);assert.equal(networkCalls,0);
}));
for (const [name, fn] of cases)
  test(name, async () => {
    await reset();
    await fn();
  });
test("STOP punctuation, whitespace and case variants remain received-message opt-outs", async()=>{
  for(const command of ["stop","Stop","STOP."," stop ","STOP","StOp","UNSUBSCRIBE","unsubscribe","UnSuBsCrIbE"]) {
    await reset(); const b=await booking();
    await webhook.processMetaWebhook(envelope(inbound(b)));
    assert.equal((await service.subscriptionState(b.token)).subscribed,true);
    await webhook.processMetaWebhook(envelope(inbound(b,randomUUID(),{text:{body:command}})));
    assert.equal((await service.subscriptionState(b.token)).subscribed,false);
  }
});
test("STOP words inside ordinary messages do not opt guests out",async()=>{
 for(const command of ["stop by reception", "don't stop", "stop booking"]) {
  await reset(); const b=await booking();
  await webhook.processMetaWebhook(envelope(inbound(b)));
  await webhook.processMetaWebhook(envelope(inbound(b,randomUUID(),{text:{body:command}})));
  assert.equal((await service.subscriptionState(b.token)).subscribed,true);
 }
});

test("review preference is relevant before review dispatch or deadline",async()=>{
  await reset(); const b=await booking({whatsapp_confirmation_consent:true,whatsapp_feedback_consent:true});
  assert.equal((await service.subscriptionState(b.token)).feedbackEditable,true);
  await webhook.processMetaWebhook(envelope(inbound(b)));
  assert.equal((await service.subscriptionState(b.token)).feedbackEditable,true);
  await sql`UPDATE whatsapp_booking_consents SET subscription_expires_at=NOW()-INTERVAL '1 hour' WHERE guest_id=${b.id}`;
  assert.equal((await service.subscriptionState(b.token)).available,true);
  await sql`UPDATE guests SET status='seated',seated_at=NOW()-INTERVAL '61 minutes' WHERE id=${b.id}`;
  assert.equal((await service.subscriptionState(b.token)).feedbackEditable,false);
  await sql`UPDATE guests SET seated_at=NOW() WHERE id=${b.id}`;
  await sql`UPDATE whatsapp_notifications SET kind='review',status='sent' WHERE guest_id=${b.id}`;
  assert.equal((await service.subscriptionState(b.token)).feedbackEditable,false);
});

test("friendly subscription verifies its sender and queues one acknowledgement without exposing the long token",async()=>{
  await reset(); const b=await booking();
  const state=await service.subscriptionState(b.token);
  const text=new URL(state.url).searchParams.get('text');
  assert.match(text,new RegExp(`^I'd like to receive updates about booking ${b.id}\\.\\nCode: [a-z]{4}-\\d{4}$`));
  assert.ok(!text.includes(b.code));
  assert.equal((await jobs()).length,0);
  for(const extra of [{from:'201111111111'},{text:{body:text.replace(/Code: .+/, 'Code: xxxx-0000')}}]) {
    await webhook.processMetaWebhook(envelope(inbound(b,randomUUID(),{text:{body:text},...extra})));
    assert.equal((await service.subscriptionState(b.token)).subscribed,false);
    assert.equal((await jobs()).length,0);
  }
  const message=inbound(b,'friendly-subscription',{text:{body:text}});
  await webhook.processMetaWebhook(envelope(message));
  let [job]=await jobs('confirmation');
  assert.equal(job.status,'pending');
  const consent=(await sql`SELECT confirmation_consent,feedback_consent FROM whatsapp_booking_consents WHERE guest_id=${b.id}`)[0];
  assert.equal(consent.confirmation_consent,true); assert.equal(consent.feedback_consent,true);
  await webhook.processMetaWebhook(envelope(message));
  await webhook.processMetaWebhook(envelope({...message,id:'friendly-subscription-again'}));
  assert.equal((await jobs('confirmation')).length,1);
  assert.equal((await jobs('confirmation'))[0].revision,job.revision);
  await service.dispatchOutbox();
  assert.equal((await jobs('confirmation'))[0].status,'simulated');
  await webhook.processMetaWebhook(envelope({...message,id:'friendly-after-send'}));
  assert.equal((await jobs('confirmation'))[0].status,'simulated');
  assert.equal(networkCalls,0);
});

test("friendly codes are booking-bound, expire, throttle guesses and preserve STOP suppression",async()=>{
  await reset(); const b=await booking();
  const text=new URL((await service.subscriptionState(b.token)).url).searchParams.get('text');
  const other=await booking({},'01000000001');
  await webhook.processMetaWebhook(envelope(inbound(other,'other-booking',{text:{body:text.replace(`booking ${b.id}.`,`booking ${other.id}.`)}})));
  assert.equal((await service.subscriptionState(other.token)).subscribed,false);
  for(let i=0;i<5;i++) await webhook.processMetaWebhook(envelope(inbound(b,`guess-${i}`,{text:{body:text.replace(/Code: .+/, 'Code: xxxx-0000')}})));
  await webhook.processMetaWebhook(envelope(inbound(b,'throttled-valid',{text:{body:text}})));
  assert.equal((await service.subscriptionState(b.token)).subscribed,false);
  await sql`UPDATE whatsapp_inbound_events SET received_at=NOW()-INTERVAL '2 hours'`;
  await sql`UPDATE whatsapp_booking_consents SET subscription_expires_at=NOW()-INTERVAL '1 second' WHERE guest_id=${b.id}`;
  await webhook.processMetaWebhook(envelope(inbound(b,'expired-friendly',{text:{body:text}})));
  assert.equal((await jobs('confirmation')).length,0);
  await sql`UPDATE whatsapp_booking_consents SET subscription_expires_at=NOW()+INTERVAL '1 day' WHERE guest_id=${b.id}`;
  await webhook.processMetaWebhook(envelope(inbound(b,'valid-friendly',{text:{body:text}})));
  await webhook.processMetaWebhook(envelope(inbound(b,'stop-friendly',{text:{body:'STOP'}})));
  await service.dispatchOutbox();
  assert.equal((await jobs('confirmation'))[0].status,'skipped');
  assert.equal(networkCalls,0);
});

test("bundled review consent requires a received subscription command; legacy choices are preserved",async()=>{
  await reset(); const b=await booking();
  const before=await service.subscriptionState(b.token);
  assert.equal(before.feedbackConsent,false);
  assert.match(decodeURIComponent(before.url),/Code: [a-z]{4}-\d{4}$/);
  await webhook.processMetaWebhook(envelope(inbound(b,'forged-bundled-review',{from:'201111111111',text:{body:`SUBSCRIBE ${b.id} ${b.code} REVIEWS`}})));
  assert.equal((await service.subscriptionState(b.token)).feedbackConsent,false);
  await webhook.processMetaWebhook(envelope(inbound(b,'bundled-review',{text:{body:`SUBSCRIBE ${b.id} ${b.code} REVIEWS`}})));
  assert.equal((await service.subscriptionState(b.token)).feedbackConsent,true);
  await sql`UPDATE guests SET status='seated',seated_at=NOW() WHERE id=${b.id}`;
  await sql.begin(tx=>service.scheduleReview(tx,b.id,new Date()));
  const [review]=await sql`SELECT due_at FROM whatsapp_notifications WHERE guest_id=${b.id} AND kind='review'`;
  assert.ok(Math.abs(new Date(review.due_at).getTime()-Date.now()-3600000)<5000);
  const legacy=await booking({},'01000000001');
  await webhook.processMetaWebhook(envelope(inbound(legacy,'legacy-review-choice')));
  assert.equal((await service.subscriptionState(legacy.token)).feedbackConsent,false);
  assert.equal(networkCalls,0);
});

test("review placeholder button replies do not change consent, submit reviews or queue notifications",async()=>{
  await reset(); const b=await booking();
  await webhook.processMetaWebhook(envelope(inbound(b,'review-placeholder-subscribe')));
  const beforeConsent=await sql`SELECT subscribed_at,unsubscribed_at,feedback_consent FROM whatsapp_booking_consents WHERE guest_id=${b.id}`;
  const beforeJobs=await sql`SELECT id,kind,status,revision FROM whatsapp_notifications WHERE guest_id=${b.id} ORDER BY id`;
  const reply=inbound(b,'review-placeholder-tap',{type:'interactive',interactive:{
    type:'button_reply',button_reply:{id:'review_placeholder',title:'Leave a review'}
  }});
  await webhook.processMetaWebhook(envelope(reply));
  await webhook.processMetaWebhook(envelope(reply));
  assert.deepEqual(await sql`SELECT subscribed_at,unsubscribed_at,feedback_consent FROM whatsapp_booking_consents WHERE guest_id=${b.id}`,beforeConsent);
  assert.deepEqual(await sql`SELECT id,kind,status,revision FROM whatsapp_notifications WHERE guest_id=${b.id} ORDER BY id`,beforeJobs);
  assert.equal((await sql`SELECT action FROM whatsapp_inbound_events WHERE message_id='review-placeholder-tap'`)[0].action,'ignored');
  assert.equal(networkCalls,0);
});

test("new ETA migration queues immutable time updates, reschedules alerts, deduplicates retries and cancels obsolete jobs",async()=>{
  await reset();
  await database.exec(fs.readFileSync('migrations/20261015_whatsapp_eta_updates.sql','utf8'));
  const b=await booking();
  await webhook.processMetaWebhook(envelope(inbound(b,'eta-subscriber')));
  await service.dispatchOutbox(); // Complete the separate subscription acknowledgement.
  const route=load('src/app/api/guests/[id]/eta/route.ts');
  const context={params:Promise.resolve({id:String(b.id)})};
  const save=(minutes,requestId=randomUUID())=>route.PATCH(new Request('https://bistro.test/api/eta',{
    method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({minutes,requestId})
  }),context);
  const firstId=randomUUID();let response=await save(30,firstId);assert.equal(response.status,200);
  const first=await response.json();assert.equal(first.whatsapp,'simulated_if_subscribed');
  let jobs=await sql`SELECT id,kind,status,due_at FROM whatsapp_notifications WHERE status='pending' ORDER BY kind`;
  assert.deepEqual(jobs.map(j=>j.kind),['almost_ready','eta_update']);
  const originalAlert=jobs.find(j=>j.kind==='almost_ready');
  assert.ok(Math.abs(new Date(originalAlert.due_at).getTime()-Date.now()-20*60000)<5000);
  const callbackCount=afters.length;
  response=await save(30,firstId);assert.equal(response.status,200);
  assert.equal((await response.json()).eta_at,first.eta_at);assert.equal(afters.length,callbackCount);
  assert.equal((await sql`SELECT id FROM whatsapp_notifications`).length,3); // Includes completed acknowledgement.
  await save(45);
  assert.equal((await sql`SELECT status FROM whatsapp_notifications WHERE id=${originalAlert.id}`)[0].status,'skipped');
  assert.equal((await sql`SELECT id FROM whatsapp_notifications WHERE status='pending'`).length,2);
  await save(5);
  jobs=await sql`SELECT id,kind FROM whatsapp_notifications WHERE status='pending'`;
  assert.deepEqual(jobs.map(j=>j.kind),['eta_update']); // One immediate message for a short ETA.
  await service.dispatchOutbox();
  assert.equal((await sql`SELECT status FROM whatsapp_notifications WHERE id=${jobs[0].id}`)[0].status,'simulated');
  // A later manual change is a new event, even after an earlier update was delivered/simulated.
  await save(40);
  assert.equal((await sql`SELECT id FROM whatsapp_notifications WHERE status='pending'`).length,2);
  await save(null);
  assert.equal((await sql`SELECT id FROM whatsapp_notifications WHERE status IN ('pending','scheduled')`).length,0);
  const optedOut=await booking({},'01000000002');
  await sql.begin(tx=>service.scheduleEtaUpdate(tx,optedOut.id,new Date(Date.now()+1800000),randomUUID()));
  assert.equal((await sql`SELECT id FROM whatsapp_notifications WHERE guest_id=${optedOut.id}`).length,0);
  const legacyNotifications=await booking({whatsapp_confirmation_consent:true,whatsapp_feedback_consent:true},'01000000003');
  await sql`UPDATE whatsapp_booking_consents SET subscribed_at=NOW() WHERE guest_id=${legacyNotifications.id}`;
  await sql`UPDATE guests SET status='seated',seated_at=NOW() WHERE id=${legacyNotifications.id}`;
  await sql.begin(tx=>service.scheduleReview(tx,legacyNotifications.id,new Date()));
  assert.deepEqual((await sql`SELECT kind FROM whatsapp_notifications WHERE guest_id=${legacyNotifications.id} ORDER BY kind`).map(j=>j.kind),['confirmation','review']);
  await sql`DELETE FROM guests WHERE id=${b.id}`;
  assert.equal((await sql`SELECT request_id FROM guest_eta_changes WHERE guest_id=${b.id}`).length,0);
  assert.equal(networkCalls,0);
});

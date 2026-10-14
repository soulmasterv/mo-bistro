import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { load, harness, request } from "./handler-harness.mjs";
function creation(options = {}) {
  const queries = [];
  let consent;
  const sql = async (strings, ...values) => {
    const q = strings.join("?");
    queries.push({ q, values });
    if (q.includes("SELECT key,value"))
      return [
        { key: "queue_capacity", value: "2" },
        { key: "approval_required", value: "false" },
      ];
    if (q.includes("COUNT(*)")) return [{ count: options.count ?? 0 }];
    if (q.includes("SELECT id FROM guests"))
      return options.duplicate ? [{ id: 1 }] : [];
    if (q.includes("UPDATE qr_registration_permits"))
      return options.expired ? [] : [{ id: 1 }];
    if (q.includes("INSERT INTO guests")) {
      if (options.failInsert) throw Error("insert failed");
      return [{ id: 10 }];
    }
    return [];
  };
  sql.begin = (fn) => fn(sql);
  const mod = load("src/lib/booking-creation.ts", {
    "@/lib/postgres-db": { getPostgres: () => sql },
    "@/lib/staff-auth": {},
    "@/lib/staff-auth-postgres": {},
    "@/lib/guest-tracking": {
      newTrackingToken: () => "a".repeat(64),
      hashTrackingToken: () => "hash",
    },
    "@/lib/whatsapp/service": {
      recordBookingConsent: async (...args) => {
        consent = args[4];
      },
    },
  });
  return { mod, queries, consent: () => consent };
}
const guest = {
  name: "Test Guest",
  phone: "01012345678",
  party_size: 2,
  seating_preference: "any",
};
test("both booking sources hold the capacity lock before reading capacity, count or duplicate", async () => {
  for (const source of ["staff", "qr"]) {
    const h = creation();
    const r = await h.mod.createBookingPostgres(guest, {
      source,
      consent: { whatsapp_confirmation_consent: true },
    });
    assert.equal(r.id, 10);
    assert.equal(r.token.length, 64);
    assert.match(h.queries[0].q, /pg_advisory_xact_lock\(91401283\)/);
    assert.equal(
      h.queries.filter((x) => x.q.includes("INSERT INTO guests")).length,
      1,
    );
    assert.equal(!!h.consent().whatsapp_confirmation_consent, source === "qr");
  }
});
test("full queue and duplicate phone stop both public and staff insertions", async () => {
  for (const source of ["qr", "staff"])
    for (const options of [{ count: 2 }, { duplicate: true }]) {
      const h = creation(options);
      const r = await h.mod.createBookingPostgres(guest, { source });
      assert.equal(r.error, options.count ? "full" : "duplicate");
      assert.ok(!h.queries.some((q) => q.q.includes("INSERT INTO guests")));
    }
});
test("QR permit is consumed in creation transaction and expired permits never insert", async () => {
  const h = creation({ expired: true });
  const r = await h.mod.createBookingPostgres(guest, {
    source: "qr",
    permit: { tokenHash: "hash", codeHash: "code" },
  });
  assert.equal(r.error, "expired");
  assert.ok(!h.queries.some((q) => q.q.includes("INSERT INTO guests")));
  const failing = creation({ failInsert: true });
  await assert.rejects(
    failing.mod.createBookingPostgres(guest, {
      source: "qr",
      permit: { tokenHash: "hash", codeHash: "code" },
    }),
  );
});
test("canonical confirmation policy wins, legacy fallback and safe default work", () => {
  const mod = load("src/lib/confirmation-policy.ts", {
    "@/lib/staff-auth": {},
    "@/lib/staff-auth-postgres": {},
  });
  assert.equal(
    mod.resolveConfirmation({
      approval_required: "false",
      require_confirmation: "true",
    }),
    false,
  );
  assert.equal(
    mod.resolveConfirmation({ require_confirmation: "false" }),
    false,
  );
  assert.equal(mod.resolveConfirmation({}), true);
});
test("demo endpoint denies Production and anonymous without SQL; Preview permits managers", async () => {
  for (const env of [
    { VERCEL_ENV: "production", NODE_ENV: "development" },
    { NODE_ENV: "production" },
  ]) {
    const h = harness();
    const route = load("src/app/api/management/demo/route.ts", h.mocks, {
      process: { env: { MO_BISTRO_DB: "postgres", ...env } },
    });
    assert.equal(
      (await route.POST(request("POST", { action: "generate" }))).status,
      404,
    );
    assert.equal(h.queries.length, 0);
  }
  const h = harness({ actor: null });
  const env = { MO_BISTRO_DB: "postgres", VERCEL_ENV: "preview" };
  const route = load("src/app/api/management/demo/route.ts", h.mocks, {
    process: { env },
  });
  assert.equal(
    (await route.POST(request("POST", { action: "generate" }))).status,
    403,
  );
  h.state.actor = { id: 1, role: "manager" };
  assert.equal(
    (await route.POST(request("POST", { action: "generate" }))).status,
    200,
  );
});
test("both PostgreSQL seating modes write seated_at with WhatsApp disabled", async () => {
  for (const simple of [false, true]) {
    const h = harness({
      query: (q) =>
        q.includes("FROM guests WHERE id=")
          ? [
              {
                id: 1,
                status: "waiting",
                party_size: 2,
                seating_preference: "any",
              },
            ]
          : q.includes("FROM restaurant_tables WHERE id=")
            ? [{ id: 1, status: "free", seats: 4, area: "indoor" }]
            : q.includes("SELECT total_tables")
              ? [{ total_tables: 2, occupied_tables: 0, max_party_size: 4 }]
              : q.includes("WHERE key='table_view_mode'")
                ? [{ value: simple ? "simple" : "detailed" }]
                : [],
    });
    const mod = load(
      simple
        ? "src/lib/simple-table-postgres.ts"
        : "src/lib/seating-postgres.ts",
      h.mocks,
    );
    if (simple) await mod.assignSimpleTable(1, "indoor", 1);
    else await mod.assignTablePostgres(1, 1);
    assert.ok(
      h.queries.some((q) =>
        q.query.includes("seated_at=COALESCE(seated_at,NOW())"),
      ),
    );
    assert.ok(!h.queries.some((q) => q.query.includes("whatsapp_")));
  }
});
test("dead setting is absent in UI; API accepts area policy without it", async () => {
  assert.ok(
    !fs
      .readFileSync("src/components/seating-settings.tsx", "utf8")
      .includes("require_table_assignment"),
  );
  const h = harness();
  const r = await h
    .route("management/seating-settings")
    .PATCH(request("PATCH", { allow_area_override: false }));
  assert.equal(r.status, 200);
  assert.ok(
    !h.queries.some((q) => q.values.includes("require_table_assignment")),
  );
});
test("support migration defines runtime-compatible permits, rate limits and core timestamp", () => {
  const s = fs.readFileSync("migrations/20261013_core_support.sql", "utf8");
  for (const token of [
    "qr_registration_permits",
    "qr_code_hash",
    "qr_expires_at BIGINT",
    "used_at TIMESTAMPTZ",
    "api_rate_limits",
    "request_count INTEGER",
    "seated_at TIMESTAMPTZ",
  ])
    assert.ok(s.includes(token), token);
});

test("lookup rejects name searches and returns no guest details or tokens", async () => {
  const h = harness({ query: () => [{ present: 1 }] });
  const route = h.route("lookup");
  assert.equal(
    (await route.POST(request("POST", { query: "Someone Else" }))).status,
    400,
  );
  const r = await route.POST(request("POST", { query: "01012345678" }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { active: true });
});
test("coordinated next-guest suggestions never repeat an Any party", () => {
  const { chooseDistinctGuests } = load("src/lib/next-guest-suggestions.ts", {
    "@/lib/postgres-db": {},
  });
  const areas = [
    { area: "indoor", seats: 4 },
    { area: "outdoor", seats: 4 },
  ];
  const guests = [
    { id: 1, name: "First", party_size: 2, seating_preference: "any" },
    { id: 2, name: "Second", party_size: 2, seating_preference: "outdoor" },
  ];
  const r = chooseDistinctGuests(areas, guests, false);
  assert.equal(r[0].guest.id, 1);
  assert.equal(r[1].guest.id, 2);
  assert.equal(chooseDistinctGuests(areas, [guests[0]], false)[1].guest, null);
});

test("staff booking response is private and ignores browser-supplied WhatsApp consent", async () => {
  const h = harness();
  let options;
  h.mocks["@/lib/booking-creation"] = {
    createBookingPostgres: async (g, o) => {
      options = o;
      return { id: 9, token: "a".repeat(64) };
    },
  };
  const r = await h
    .route("guests")
    .POST(
      request("POST", {
        ...guest,
        whatsapp_confirmation_consent: true,
        whatsapp_feedback_consent: true,
      }),
    );
  assert.equal(r.status, 201);
  assert.equal(options.source, "staff");
  assert.equal(options.consent, undefined);
  assert.equal((await r.json()).token.length, 64);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
});
test("guest listing and tracking use the same canonical confirmation policy", async () => {
  const h = harness({
    approval: "false",
    query: (q) =>
      q.includes("COUNT(*)")
        ? [{ count: 0 }]
        : [
            {
              id: 1,
              name: "Guest",
              status: "waiting",
              confirmed: 0,
              created_at: "2026-10-12",
            },
          ],
  });
  const guests = await (await h.route("guests").GET()).json();
  assert.equal(guests[0].confirmation_required, false);
  const track = await (
    await h
      .route("track")
      .GET(new Request("https://bistro.test/api/track?token=" + "a".repeat(64)))
  ).json();
  assert.equal(track.confirmation_required, false);
});

test("diagnostic page guards honor Production even when development flag is present",()=>{
 const {testEnvironmentAllowed}=load("src/lib/test-environment.ts",{}, {process:{env:{VERCEL_ENV:"production",NODE_ENV:"development"}}});assert.equal(testEnvironmentAllowed(),false);
 for(const page of ["debug","runtime-test"]){const source=fs.readFileSync(`src/app/${page}/page.tsx`,"utf8");assert.ok(source.includes("if(!testEnvironmentAllowed())notFound()"));}
});

test('tracking exposes only the owning active booking readiness and hides it for terminal states',async()=>{
  for(const status of ['waiting','called','seated','cancelled','no_show']) {
    const h=harness({query:q=>q.includes('COUNT(*)')?[{count:0}]:[{id:1,name:'Guest',party_size:2,status,confirmed:1,created_at:'2026-10-14',eta_at:'2026-10-14T16:30:00Z'}]});
    h.mocks['@/lib/guest-eta-support']={hasGuestEtaColumn:async()=>true};
    const response=await h.route('track').GET(new Request('https://bistro.test/api/track?token='+'a'.repeat(64)));
    const body=await response.json();
    assert.equal(body.guest.eta_at,['waiting','called'].includes(status)?'2026-10-14T16:30:00Z':null);
    assert.equal(body.guest.phone,undefined);assert.equal(body.guest.tracking_token_hash,undefined);
    const owned=h.queries.find(q=>q.query.includes('FROM guests WHERE tracking_token_hash'));
    assert.ok(owned);assert.equal(owned.values.length,1);
  }
});

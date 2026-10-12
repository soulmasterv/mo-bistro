import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./handler-harness.mjs";

const token = "offline-only-meta-verification-token";
function route(overrides = {}) {
  // This suite must never open a database or contact a message provider.
  return load(
    "src/app/api/whatsapp/webhook/route.ts",
    {
      "@/lib/postgres-db": {
        getPostgres() {
          assert.fail("Verification must not access a database");
        },
      },
    },
    {
      process: {
        env: {
          MO_BISTRO_DB: "postgres",
          WHATSAPP_ENABLED: "true",
          WHATSAPP_MODE: "test",
          META_WEBHOOK_VERIFY_TOKEN: token,
          ...overrides,
        },
      },
      fetch() {
        assert.fail("Verification must not contact a message provider");
      },
    },
  );
}
function verification(parameters = {}) {
  const query = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": token,
    "hub.challenge": "000123456789012345678901234567890",
    ...parameters,
  });
  return new Request("https://bistro.test/api/whatsapp/webhook?" + query);
}

test("Meta verification returns HTTP 200 and the exact plain-text challenge", async () => {
  const handler = route();
  assert.equal(typeof handler.GET, "function");
  assert.equal(typeof handler.POST, "function");
  const response = await handler.GET(verification());
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "text/plain; charset=utf-8",
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), "000123456789012345678901234567890");
});
test("Verification rejects wrong/missing tokens and unsupported modes", async () => {
  for (const parameters of [
    { "hub.verify_token": "wrong" },
    { "hub.verify_token": "" },
    { "hub.mode": "unsubscribe" },
  ]) {
    assert.equal((await route().GET(verification(parameters))).status, 403);
  }
  assert.equal(
    (await route({ META_WEBHOOK_VERIFY_TOKEN: "" }).GET(verification())).status,
    403,
  );
});
test("Verification retains challenge validation", async () => {
  for (const challenge of ["", "abc", "1".repeat(101)]) {
    assert.equal(
      (await route().GET(verification({ "hub.challenge": challenge }))).status,
      400,
    );
  }
});
test("Disabled integration still rejects GET and POST without database or network calls", async () => {
  const handler = route({ WHATSAPP_ENABLED: "false" });
  assert.equal((await handler.GET(verification())).status, 403);
  assert.equal(
    (
      await handler.POST(
        new Request("https://bistro.test/api/whatsapp/webhook", {
          method: "POST",
          body: "{}",
        }),
      )
    ).status,
    503,
  );
});
test("POST still rejects an unsigned webhook without processing it", async () => {
  const response = await route({ META_APP_SECRET: "offline-test-secret" }).POST(
    new Request("https://bistro.test/api/whatsapp/webhook", {
      method: "POST",
      body: "{}",
    }),
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Invalid signature" });
});

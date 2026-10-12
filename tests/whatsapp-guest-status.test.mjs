import test from "node:test";
import assert from "node:assert/strict";
import { harness, context, request } from "./handler-harness.mjs";
function setup(options = {}) {
  const h = harness(options);
  h.mocks["@/lib/whatsapp/policy"] = { whatsappEnabled: () => true };
  return h;
}
for (const actor of [null, { id: 2, role: "waiter" }])
  test(
    "WhatsApp guest status denies unauthorized role " +
      (actor?.role ?? "anonymous"),
    async () => {
      const h = setup({ actor });
      const response = await h
        .route("whatsapp/guests/[id]")
        .GET(request("GET"), context(1));
      assert.equal(response.status, actor ? 403 : 401);
      assert.equal(h.queries.length, 0);
    },
  );
test("WhatsApp status exposes consent without tokens, writes or provider calls", async () => {
  const h = setup({
    query: () => [
      {
        subscribed_at: "2026-10-12",
        unsubscribed_at: null,
        opted_out_at: null,
        confirmation_consent: true,
        feedback_consent: true,
      },
    ],
  });
  const response = await h
    .route("whatsapp/guests/[id]")
    .GET(request("GET"), context(1));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    available: true,
    subscribed: true,
    opted_out: false,
    confirmation_consent: true,
    feedback_consent: true,
  });
  assert.equal(h.queries.length, 1);
  assert.match(h.queries[0].query, /^SELECT /);
});
test("STOP overrides subscription and missing integration performs no SQL", async () => {
  const h = setup({
    query: () => [
      {
        subscribed_at: "2026-10-12",
        opted_out_at: "2026-10-12",
        feedback_consent: true,
      },
    ],
  });
  const response = await h
    .route("whatsapp/guests/[id]")
    .GET(request("GET"), context(1));
  assert.equal((await response.json()).subscribed, false);
  const disabled = setup();
  disabled.mocks["@/lib/whatsapp/policy"] = { whatsappEnabled: () => false };
  assert.deepEqual(
    await (
      await disabled
        .route("whatsapp/guests/[id]")
        .GET(request("GET"), context(1))
    ).json(),
    { available: false },
  );
  assert.equal(disabled.queries.length, 0);
});
test("Guest status validates IDs and distinguishes missing guest/backend failure", async () => {
  const h = setup();
  assert.equal(
    (await h.route("whatsapp/guests/[id]").GET(request("GET"), context(0)))
      .status,
    400,
  );
  assert.equal(h.queries.length, 0);
  assert.equal(
    (await h.route("whatsapp/guests/[id]").GET(request("GET"), context(1)))
      .status,
    404,
  );
  const failed = setup({
    query: () => {
      throw Error("private connection details");
    },
  });
  const response = await failed
    .route("whatsapp/guests/[id]")
    .GET(request("GET"), context(1));
  assert.equal(response.status, 503);
  assert.equal(
    JSON.stringify(await response.json()).includes("private"),
    false,
  );
});

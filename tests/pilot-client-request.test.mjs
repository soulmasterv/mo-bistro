import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./handler-harness.mjs";

function client(fetch) {
  const timers = new Map();
  let id = 0;
  const api = load(
    "src/lib/pilot/client-request.ts",
    {},
    {
      window: {
        setTimeout(callback) {
          timers.set(++id, callback);
          return id;
        },
        clearTimeout(key) {
          timers.delete(key);
        },
      },
      fetch,
    },
  );
  return { api, timers };
}
test("client requests preserve response and clear their deadline", async () => {
  const response = Response.json({ ok: true });
  const { api, timers } = client(async (_url, options) => {
    assert.equal(options.signal.aborted, false);
    return response;
  });
  assert.equal(
    await api.fetchWithTimeout("/fixture", { method: "PATCH" }, 100),
    response,
  );
  assert.equal(timers.size, 0);
});
test("parent cancellation stays an abort and detaches its listener", async () => {
  const parent = new AbortController();
  let removed = 0;
  const original = parent.signal.removeEventListener.bind(parent.signal);
  parent.signal.removeEventListener = (...args) => {
    removed++;
    return original(...args);
  };
  const { api, timers } = client(
    (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        ),
      ),
  );
  const pending = api.fetchWithTimeout(
    "/fixture",
    { signal: parent.signal },
    100,
  );
  parent.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(timers.size, 0);
  assert.equal(removed, 1);
});
test("deadline abort is reported as a timeout and clears its timer", async () => {
  const { api, timers } = client(
    (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        ),
      ),
  );
  const pending = api.fetchWithTimeout("/fixture", {}, 100);
  [...timers.values()][0]();
  await assert.rejects(pending, {
    name: "TimeoutError",
    message: "Request timed out.",
  });
  assert.equal(timers.size, 0);
});
test("insecure LAN contexts still produce valid unique event ids", () => {
  let seed = 0;
  const { eventId } = load(
    "src/lib/pilot/client-request.ts",
    {},
    {
      crypto: {
        getRandomValues(bytes) {
          bytes.fill(++seed);
          return bytes;
        },
      },
    },
  );
  const first = eventId(),
    second = eventId();
  assert.match(
    first,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  assert.notEqual(first, second);
});

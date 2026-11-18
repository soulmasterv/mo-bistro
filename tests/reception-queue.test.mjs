import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./handler-harness.mjs";

const { deriveReceptionQueue, elapsedWait } = load("src/lib/reception-queue.ts");
const guest = (id, status, name = "Guest", phone = "01000000001") => ({
  id, status, name, phone, party_size: 2, seating_preference: "any", confirmed: 1,
  source: "qr", created_at: "2026-11-18T10:00:00Z",
});

test("Called parties retain their position ahead of waiting guests until seated", () => {
  const state = deriveReceptionQueue([
    guest(1, "called"), guest(2, "waiting"), guest(3, "seated"),
    guest(4, "cancelled"), guest(5, "no_show"),
  ], "", "all");
  assert.deepEqual(Array.from(state.active, item => item.id), [1, 2]);
  assert.deepEqual(Array.from(state.filtered, item => item.id), [1, 2]);
  assert.equal(state.active[0].id, 1);
  assert.equal(state.waiting, 1);
  assert.equal(state.seated, 1);
  assert.equal(state.positions.get(2), 2);
});

test("Search and status filters do not renumber guests or change who is next", () => {
  const guests = [guest(1, "called", "Omar"), guest(2, "waiting", "Nour", "01099999999"),
    guest(3, "seated", "Mariam"), guest(4, "seated", "Salma")];
  const found = deriveReceptionQueue(guests, "NOUR", "all");
  assert.deepEqual(Array.from(found.filtered, item => item.id), [2]);
  assert.equal(found.positions.get(2), 2);
  assert.equal(found.active[0].id, 1);
  assert.equal(deriveReceptionQueue(guests, "999999", "waiting").filtered[0].id, 2);
  const seated = deriveReceptionQueue(guests, "Salma", "seated");
  assert.equal(seated.filtered[0].id, 4);
  assert.equal(seated.positions.get(4), 2);
  assert.equal(deriveReceptionQueue(guests, "Omar", "waiting").filtered.length, 0);
});

test("Wait labels handle seated, invalid, future, and over-one-hour timestamps", () => {
  const clock = Date.parse("2026-11-18T11:05:00Z");
  assert.equal(elapsedWait(guest(1, "waiting"), clock), "1h 5m");
  assert.equal(elapsedWait(guest(1, "seated"), clock), "—");
  assert.equal(elapsedWait({status: "waiting", created_at: "invalid"}, clock), "—");
  assert.equal(elapsedWait(guest(1, "waiting"), 0), "—");
  assert.equal(elapsedWait(guest(1, "waiting"), clock - 2 * 3600000), "0 min");
});

test("Closing or refreshing the QR dialog cancels late registration-link responses", async () => {
  const effects = [], intervals = [], pending = [], states = [];
  let cleared = false;
  const Dialog = load("src/components/reception/registration-qr-dialog.tsx", {
    react: {
      useRef: value => ({current: value}),
      useEffect: callback => effects.push(callback),
      useState(initial) {
        const index = states.length;
        states.push(initial);
        return [initial, value => {states[index] = value;}];
      },
    },
    "react-dom": {createPortal: value => value},
    "@/lib/use-staff-dialog": {useStaffDialog() {}},
  }, {
    document: {body: {}},
    window: {setInterval(callback) {intervals.push(callback);return 1;}, clearInterval() {cleared = true;}},
    fetch: (_url, options) => new Promise(resolve => pending.push({options, resolve})),
  }).default;
  Dialog({onClose() {}});
  const close = effects[0]();
  assert.equal(pending.length, 1);
  intervals[0]();
  assert.equal(pending[0].options.signal.aborted, true);
  pending[1].resolve(Response.json({url: "https://example.test/join?qr=new"}));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states[0], "https://example.test/join?qr=new");
  close();
  assert.equal(cleared, true);
  assert.equal(pending[1].options.signal.aborted, true);
  pending[0].resolve(Response.json({url: "https://example.test/join?qr=old"}));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states[0], "https://example.test/join?qr=new");
});

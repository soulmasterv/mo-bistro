import test from "node:test";
import assert from "node:assert/strict";
import {load} from "./handler-harness.mjs";

test("overlapping dialogs restore scrolling only after the final sheet closes", () => {
  const document = {body:{style:{overflow:"auto"}}};
  const {lockDialogScroll} = load("src/lib/dialog-scroll-lock.ts", {}, {document});
  const first = lockDialogScroll(), second = lockDialogScroll();
  first();
  assert.equal(document.body.style.overflow, "hidden");
  first(); // Repeated cleanup cannot unlock a different dialog.
  assert.equal(document.body.style.overflow, "hidden");
  second();
  assert.equal(document.body.style.overflow, "auto");
});

test("reverse close order preserves the original body overflow", () => {
  const document = {body:{style:{overflow:""}}};
  const {lockDialogScroll} = load("src/lib/dialog-scroll-lock.ts", {}, {document});
  const first = lockDialogScroll(), second = lockDialogScroll();
  second();
  assert.equal(document.body.style.overflow, "hidden");
  first();
  assert.equal(document.body.style.overflow, "");
});

import { getSettingPostgres } from "@/lib/staff-auth-postgres";
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSetting } from "@/lib/staff-auth";

function secret() {
  const value = process.env.STAFF_SESSION_SECRET;

  if (!value || value.length < 32) {
    throw new Error("QR signing secret is not configured");
  }

  return value;
}

function sign(slot: number, interval: number) {
  return createHmac("sha256", secret())
    .update(`restaurant-qr-v1:${interval}:${slot}`)
    .digest("hex");
}

export async function getCurrentQR() {
  const interval = Number(process.env.MO_BISTRO_DB === "postgres"
    ? await getSettingPostgres("qr_rotation_seconds", "300")
    : getSetting("qr_rotation_seconds", "300"));
  const now = Math.floor(Date.now() / 1000);
  const slot = Math.floor(now / interval);

  return {
    code: `${slot}.${sign(slot, interval)}`,
    expiresAt: (slot + 1) * interval * 1000,
    interval,
  };
}

export async function verifyQR(code: unknown) {
  if (typeof code !== "string" || code.length > 100) {
    return false;
  }

  const [slotText, signature] = code.split(".");

  if (
    !/^\d+$/.test(slotText || "") ||
    !/^[a-f0-9]{64}$/.test(signature || "")
  ) {
    return false;
  }

  const slot = Number(slotText);
  const interval = Number(process.env.MO_BISTRO_DB === "postgres"
    ? await getSettingPostgres("qr_rotation_seconds", "300")
    : getSetting("qr_rotation_seconds", "300"));
  const currentSlot = Math.floor(Date.now() / 1000 / interval);

  if (slot !== currentSlot) {
    return false;
  }

  const expected = Buffer.from(sign(slot, interval), "hex");
  const actual = Buffer.from(signature, "hex");

  return timingSafeEqual(expected, actual);
}

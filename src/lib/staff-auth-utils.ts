import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/staff-session-shared";

export function hashCredential(value: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(value, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyCredential(value: string, stored: string) {
  const [salt, expectedHex] = stored.split(":");

  if (!salt || !expectedHex) return false;

  const actual = scryptSync(value, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");

  return actual.length === expected.length &&
    timingSafeEqual(actual, expected);
}

export async function setSessionCookie(token: string, expiresAt: number) {
  const jar = await cookies();

  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" &&
      process.env.STAFF_COOKIE_SECURE === "true",
    path: "/",
    expires: new Date(expiresAt),
  });
}

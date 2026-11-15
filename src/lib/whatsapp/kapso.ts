import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/whatsapp/policy";

export function usesKapso() {
  return process.env.VERCEL_ENV === "preview" && process.env.WHATSAPP_PROVIDER === "kapso";
}

export function whatsappPhoneId() {
  return usesKapso() ? process.env.KAPSO_PHONE_NUMBER_ID : process.env.META_WHATSAPP_PHONE_NUMBER_ID;
}

export function verifyKapsoSignature(body: string, signature: string | null) {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return safeEqual(createHmac("sha256", secret).update(body).digest("hex"), signature);
}

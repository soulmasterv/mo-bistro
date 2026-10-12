import { safeEqual } from "@/lib/whatsapp/policy";
export async function readWebhookBody(request: Request, limit = 256_000) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done,value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) { await reader.cancel(); throw new Error("Body too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
export function dispatcherAuthorized(request: Request) {
  const secret = process.env.WHATSAPP_DISPATCH_SECRET;
  return !!secret && secret.length >= 32 && safeEqual(request.headers.get("authorization") || "",`Bearer ${secret}`);
}

import { previewTestEnabled } from "@/lib/whatsapp/preview-test";
import { after } from "next/server";
import {
  safeEqual,
  verifyMetaSignature,
  whatsappEnabled,
} from "@/lib/whatsapp/policy";
import { readWebhookBody } from "@/lib/whatsapp/http";
import { processMetaWebhook } from "@/lib/whatsapp/webhook";
import { dispatchOutbox } from "@/lib/whatsapp/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const configured = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (
    !whatsappEnabled() ||
    !configured ||
    params.get("hub.mode") !== "subscribe" ||
    !safeEqual(params.get("hub.verify_token") || "", configured)
  )
    return new Response("Forbidden", { status: 403 });
  const challenge = params.get("hub.challenge");
  if (!challenge || !/^\d{1,100}$/.test(challenge)) {
    return new Response("Invalid challenge", { status: 400 });
  }
  // Meta requires the challenge verbatim, not JSON or a numeric conversion.
  return new Response(challenge, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
export async function POST(request: Request) {
  if (!whatsappEnabled())
    return Response.json({ error: "Disabled" }, { status: 503 });
  let raw;
  try {
    raw = await readWebhookBody(request);
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 413 });
  }
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256")))
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !payload ||
    payload.object !== "whatsapp_business_account" ||
    !Array.isArray(payload.entry)
  )
    return Response.json({ error: "Invalid envelope" }, { status: 400 });
  try {
    await processMetaWebhook(payload);
    if (!previewTestEnabled()) after(async () => {
      try {
        await dispatchOutbox();
      } catch {
        console.error("WhatsApp outbox dispatch deferred");
      }
    });
    return Response.json({ received: true });
  } catch {
    return Response.json(
      { error: "Webhook processing unavailable" },
      { status: 503 },
    );
  }
}

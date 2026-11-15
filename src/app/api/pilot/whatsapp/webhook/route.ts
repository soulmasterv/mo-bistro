import { getPostgres } from "@/lib/postgres-db";
import { readWebhookBody } from "@/lib/whatsapp/http";
import { usesKapso, verifyKapsoSignature, whatsappPhoneId } from "@/lib/whatsapp/kapso";
import { isStop, whatsappEnabled } from "@/lib/whatsapp/policy";

export async function POST(request: Request) {
  const business = whatsappPhoneId();
  if (!usesKapso() || !business || !whatsappEnabled()) {
    return Response.json({ error: "Pilot WhatsApp unavailable" }, { status: 503 });
  }

  let raw: string;
  try { raw = await readWebhookBody(request); }
  catch { return Response.json({ error: "Invalid body" }, { status: 413 }); }

  if (!verifyKapsoSignature(raw, request.headers.get("x-webhook-signature"))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload;
  try { payload = JSON.parse(raw); }
  catch { return Response.json({ error: "Invalid payload" }, { status: 400 }); }
  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    return Response.json({ error: "Invalid envelope" }, { status: 400 });
  }

  try {
    const sql = getPostgres();
    for (const entry of payload.entry) {
      if (!Array.isArray(entry?.changes)) continue;
      for (const change of entry.changes) {
        const value = change?.value;
        if (change?.field !== "messages" || value?.metadata?.phone_number_id !== business || !Array.isArray(value.messages)) continue;
        for (const message of value.messages) {
          if (message?.type !== "text" || typeof message.text?.body !== "string" ||
              typeof message.from !== "string" || !/^201[0125]\d{8}$/.test(message.from)) continue;
          const seconds = Number(message.timestamp);
          if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds * 1000 > Date.now()) continue;
          const received = new Date(seconds * 1000);
          const text = message.text.body.trim();
          const phone = "0" + message.from.slice(2);
          if (isStop(text)) {
            await sql`UPDATE public.pilot_parties SET whatsapp_consent_at=NULL,whatsapp_inbound_after_opt_in_at=NULL
              WHERE phone=${phone} AND whatsapp_consent_at < ${new Date(received.getTime() + 1000)}`;
            continue;
          }

          const ticket = /^Please send my table-ready message for Mo Bistro pilot ticket #(\d+)\.$/i.exec(text);
          const id = Number(ticket?.[1]);
          if (!Number.isSafeInteger(id) || id < 1) continue;
          await sql.begin(async tx => {
            const matched = await tx`UPDATE public.pilot_parties
              SET whatsapp_inbound_after_opt_in_at=GREATEST(whatsapp_inbound_after_opt_in_at,${received})
              WHERE id=${id} AND phone=${phone} AND status='waiting'
                AND whatsapp_consent_at IS NOT NULL AND whatsapp_consent_at < ${new Date(received.getTime()+1000)}
              RETURNING id`;
            if (!matched.length) return;
            await tx`INSERT INTO public.whatsapp_customer_windows(phone,phone_number_id,last_inbound_at)
              VALUES (${message.from},${business},${received})
              ON CONFLICT (phone,phone_number_id) DO UPDATE
              SET last_inbound_at=GREATEST(whatsapp_customer_windows.last_inbound_at,EXCLUDED.last_inbound_at)`;
          });
        }
      }
    }
    return Response.json({ received: true });
  } catch {
    return Response.json({ error: "Pilot WhatsApp processing unavailable" }, { status: 503 });
  }
}

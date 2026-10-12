import { whatsappEnabled } from "@/lib/whatsapp/policy";
import { dispatcherAuthorized, readWebhookBody } from "@/lib/whatsapp/http";
import { verifyQstash } from "@/lib/whatsapp/transport";
import { dispatchOutbox } from "@/lib/whatsapp/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!whatsappEnabled()) return Response.json({error:"Disabled"},{status:503});
  let raw;
  try { raw=await readWebhookBody(request,4096); } catch { return Response.json({error:"Invalid body"},{status:413}); }
  if (!dispatcherAuthorized(request) && !await verifyQstash(raw,request.headers.get("upstash-signature"),"/api/whatsapp/dispatch")) {
    return Response.json({error:"Unauthorized"},{status:401});
  }
  try { await dispatchOutbox(); return Response.json({ok:true}); }
  catch { return Response.json({error:"Dispatch unavailable"},{status:503}); }
}

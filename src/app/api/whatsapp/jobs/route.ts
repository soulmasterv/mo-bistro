import { z } from "zod";
import { whatsappEnabled } from "@/lib/whatsapp/policy";
import { readWebhookBody } from "@/lib/whatsapp/http";
import { verifyQstash } from "@/lib/whatsapp/transport";
import { deliverNotification } from "@/lib/whatsapp/service";
export const runtime = "nodejs";
const schema = z.object({notificationId:z.uuid(),revision:z.number().int().positive()}).strict();
export async function POST(request: Request) {
  if (!whatsappEnabled()) return Response.json({error:"Disabled"},{status:503});
  let raw;
  try { raw=await readWebhookBody(request,4096); } catch { return Response.json({error:"Invalid body"},{status:413}); }
  if (!await verifyQstash(raw,request.headers.get("upstash-signature"),"/api/whatsapp/jobs")) return Response.json({error:"Invalid signature"},{status:401});
  const parsed=schema.safeParse(await Promise.resolve().then(()=>JSON.parse(raw)).catch(()=>null));
  if (!parsed.success) return Response.json({error:"Invalid job"},{status:400});
  try {
    const result=await deliverNotification(parsed.data.notificationId,parsed.data.revision);
    return Response.json({result},{status:result==="retry"?503:200});
  } catch { return Response.json({error:"Delivery unavailable"},{status:503}); }
}

import { z } from "zod";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { subscriptionState, scheduleReview, dispatchOutbox } from "@/lib/whatsapp/service";
import { after } from "next/server";
import { whatsappEnabled, hashCode, CONSENT_VERSION } from "@/lib/whatsapp/policy";
import { getPostgres } from "@/lib/postgres-db";
export const runtime="nodejs";
const schema=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),feedbackConsent:z.boolean()}).strict();
export async function GET(request:Request) {
  const limited=await checkRateLimit(request,"whatsapp-subscription",20,60); if(limited)return limited;
  const token=new URL(request.url).searchParams.get("token");
  if(!token || !/^[a-f0-9]{64}$/.test(token)) return Response.json({error:"Invalid token"},{status:400});
  try { return Response.json(await subscriptionState(token),{headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}}); }
  catch {return Response.json({error:"Subscription unavailable"},{status:503});}
}
// Records optional feedback permission, never subscription. Clicking a link is not opt-in.
export async function PATCH(request:Request) {
  if(!whatsappEnabled())return Response.json({error:"Disabled"},{status:503});
  const origin=rejectCrossOrigin(request);if(origin)return origin;
  const limited=await checkRateLimit(request,"whatsapp-feedback-consent",10,60);if(limited)return limited;
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:"Invalid consent"},{status:400});
  try {
    const sql=getPostgres();
    const rows=await sql.begin(async tx => {
      const [contact]=await tx`SELECT c.guest_id,c.phone FROM whatsapp_booking_consents c JOIN guests g ON g.id=c.guest_id
        WHERE g.tracking_token_hash=${hashCode(parsed.data.token)}`;
      if(!contact)return [];
      await tx`SELECT pg_advisory_xact_lock(hashtext(${contact.phone}))`;
      const updated=await tx`UPDATE whatsapp_booking_consents SET feedback_consent=${parsed.data.feedbackConsent},
        consent_recorded_at=NOW(),consent_version=${CONSENT_VERSION}
        WHERE guest_id=${contact.guest_id} RETURNING guest_id`;
      if(updated.length) {
        if(parsed.data.feedbackConsent) {
          const [guest]=await tx`SELECT status,seated_at FROM guests WHERE id=${updated[0].guest_id}`;
          if(guest.status==='seated' && guest.seated_at) await scheduleReview(tx,updated[0].guest_id,new Date(guest.seated_at));
        } else await tx`UPDATE whatsapp_notifications SET status='skipped',revision=revision+1,updated_at=NOW()
          WHERE guest_id=${updated[0].guest_id} AND kind='review' AND status IN ('pending','scheduled')`;
      }
      return updated;
    });
    if(rows.length) after(async()=>{try{await dispatchOutbox();}catch{console.error("WhatsApp outbox dispatch deferred");}});
    return Response.json({saved:!!rows.length},{status:rows.length?200:404});
  }catch{return Response.json({error:"Consent unavailable"},{status:503});}
}

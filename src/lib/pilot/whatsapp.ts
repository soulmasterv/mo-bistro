import "server-only";
import { Receiver } from '@upstash/qstash';
import { getPostgres } from '@/lib/postgres-db';
import { liveSendingEnabled, normalizePhone, whatsappEnabled } from '@/lib/whatsapp/policy';
import { requestMetaTemplate as sendMetaMessage } from '@/lib/whatsapp/transport';
import { PILOT_ORIGIN, PILOT_JOB_PATH } from './config';
import { finalizePendingExits } from '@/lib/pilot/store';

export async function verifyPilotJob(raw:string,signature:string|null) {
 const current=process.env.QSTASH_CURRENT_SIGNING_KEY,next=process.env.QSTASH_NEXT_SIGNING_KEY;
 if(!current||!next||!signature)return false;
 try{return await new Receiver({currentSigningKey:current,nextSigningKey:next}).verify({signature,body:raw,url:PILOT_ORIGIN+PILOT_JOB_PATH});}catch{return false;}
}
// Pilot Notify is immediate: do not wait for an external scheduling callback.
// Leases avoid waste; the durable delivery claim remains the at-most-once boundary.
export async function publishPilotCalls(partyId?:number) {
 const sql=getPostgres();
 await sql`UPDATE public.pilot_ready_messages SET status='unknown',last_error='send_interrupted',updated_at=NOW()
 WHERE status='sending' AND updated_at<NOW()-INTERVAL '1 minute'`;
 const jobs=await sql`UPDATE public.pilot_ready_messages SET publish_lease_until=NOW()+INTERVAL '30 seconds'
 WHERE id IN (SELECT id FROM public.pilot_ready_messages WHERE status IN ('pending','scheduled')
 AND (${partyId??null}::integer IS NULL OR party_id=${partyId??null})
 AND publish_retry_at<=NOW() AND (publish_lease_until IS NULL OR publish_lease_until<NOW())
 ORDER BY created_at LIMIT 2 FOR UPDATE SKIP LOCKED) RETURNING id`;
 await Promise.all(jobs.map(job=>deliverPilotCall(job.id)));
}
export async function deliverPilotCall(id:string) {
 await finalizePendingExits();
 const sql=getPostgres();
 const claimed=await sql`UPDATE public.pilot_ready_messages SET status='sending',attempts=attempts+1,updated_at=NOW()
 WHERE id=${id} AND status IN ('pending','scheduled') RETURNING party_id`;
 if(!claimed.length)return;
 await sql.begin(async tx=>{
  const [party]=await tx`SELECT * FROM public.pilot_parties WHERE id=${claimed[0].party_id} FOR UPDATE`;
  if(party?.pending_exit_at){
   await tx`UPDATE public.pilot_ready_messages SET status='pending',attempts=attempts-1,publish_retry_at=${party.pending_exit_at},publish_lease_until=NULL,updated_at=NOW() WHERE id=${id}`;
   return;
  }
  let state='skipped',error:string|null=null,messageId:string|null=null;
  if(!party||party.status!=='waiting')error='party_not_waiting';
  else if(!party.whatsapp_consent_at)error='guest_not_opted_in';
  else if(!whatsappEnabled())error='whatsapp_disabled';
  else if(!liveSendingEnabled())state='simulated';
  else {
   const phone=normalizePhone(party.phone);
   await tx`SELECT pg_advisory_xact_lock(hashtext(${phone}))`;
   const [stop]=await tx`SELECT opted_out_at FROM public.whatsapp_contact_preferences WHERE phone=${phone}`;
   if(stop?.opted_out_at && new Date(stop.opted_out_at)>=new Date(party.whatsapp_consent_at))error='guest_unsubscribed';
   else if(process.env.VERCEL_ENV!=='production'&&(!process.env.WHATSAPP_TEST_RECIPIENT||phone!==safeTestPhone()))error='preview_recipient_not_allowed';
   else {
    const [window]=await tx`SELECT last_inbound_at FROM public.whatsapp_customer_windows WHERE phone=${phone}
     AND phone_number_id=${process.env.META_WHATSAPP_PHONE_NUMBER_ID||''}
     AND last_inbound_at>clock_timestamp()-INTERVAL '24 hours'+INTERVAL '10 seconds'
     AND last_inbound_at<=clock_timestamp()`;
    const result=!window?{state:'skipped',error:'customer_service_window_closed',messageId:undefined}
     :process.env.WHATSAPP_WINDOW_TEXT_ENABLED==='true'?await sendMetaMessage({messaging_product:'whatsapp',to:phone,type:'text',biz_opaque_callback_data:id,
       text:{body:`Mo Bistro - District 5\n\nHi ${party.name}, your table is ready. Please come to reception for booking #${party.id}.\n\nTo unsubscribe, reply STOP.`}})
     :{state:'skipped',error:'window_text_disabled',messageId:undefined};
    state=result.state==='pending'?'failed':result.state;error=result.error??null;messageId=result.messageId??null;
   }
  }
  await tx`UPDATE public.pilot_ready_messages SET status=${state},last_error=${error},provider_message_id=${messageId},updated_at=NOW() WHERE id=${id}`;
  if(state==='sent')await tx`UPDATE public.pilot_parties SET status='called',called_at=clock_timestamp(),informed_via='whatsapp_accepted' WHERE id=${party.id} AND status='waiting'`;
 });
}
function safeTestPhone(){try{return normalizePhone(process.env.WHATSAPP_TEST_RECIPIENT||'');}catch{return null;}}

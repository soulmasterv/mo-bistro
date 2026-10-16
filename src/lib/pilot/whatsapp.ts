import "server-only";
import { Receiver } from '@upstash/qstash';
import { getPostgres } from '@/lib/postgres-db';
import { liveSendingEnabled, normalizePhone, whatsappEnabled } from '@/lib/whatsapp/policy';
import { requestMetaTemplate } from '@/lib/whatsapp/transport';
import { PILOT_ORIGIN, PILOT_JOB_PATH } from './config';
import { finalizePendingExits } from '@/lib/pilot/store';

export async function verifyPilotJob(raw:string,signature:string|null) {
 const current=process.env.QSTASH_CURRENT_SIGNING_KEY,next=process.env.QSTASH_NEXT_SIGNING_KEY;
 if(!current||!next||!signature)return false;
 try{return await new Receiver({currentSigningKey:current,nextSigningKey:next}).verify({signature,body:raw,url:PILOT_ORIGIN+PILOT_JOB_PATH});}catch{return false;}
}
export async function publishPilotCalls() {
 const sql=getPostgres();
 await sql`UPDATE public.pilot_ready_messages SET status='unknown',last_error='send_interrupted',updated_at=NOW()
 WHERE status='sending' AND updated_at<NOW()-INTERVAL '2 minutes'`;
 await sql`UPDATE public.pilot_ready_messages SET status='failed',last_error='scheduler_callback_missing',updated_at=NOW()
 WHERE status='scheduled' AND updated_at<NOW()-INTERVAL '10 minutes'`;
 const jobs=await sql`UPDATE public.pilot_ready_messages SET publish_lease_until=NOW()+INTERVAL '1 minute'
 WHERE id IN (SELECT id FROM public.pilot_ready_messages WHERE status='pending'
 AND publish_retry_at<=NOW() AND (publish_lease_until IS NULL OR publish_lease_until<NOW())
 ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING id`;
 for(const job of jobs) {
  if(!liveSendingEnabled()){await deliverPilotCall(job.id);continue;}
  try {
   const token=process.env.QSTASH_TOKEN;
   const base=new URL(process.env.QSTASH_URL||'https://qstash.upstash.io');
   if(!token||base.protocol!=='https:'||!/^qstash(?:-[a-z0-9-]+)?\.upstash\.io$/.test(base.hostname)||base.username||base.password||base.port||base.search||base.hash||base.pathname!=='/')throw Error();
   const response=await fetch(`${base.origin}/v2/publish/${PILOT_ORIGIN+PILOT_JOB_PATH}`,{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Upstash-Retries':'5','Upstash-Deduplication-Id':`pilot-${job.id}`},
    body:JSON.stringify({notificationId:job.id}),
   });
   const result=await response.json().catch(()=>null);
   if(!response.ok||typeof result?.messageId!=='string'||result.messageId.length>256)throw Error();
   await sql`UPDATE public.pilot_ready_messages SET status='scheduled',qstash_message_id=${result.messageId},publish_lease_until=NULL,last_error=NULL,updated_at=NOW()
    WHERE id=${job.id} AND status='pending'`;
  } catch {
   await sql`UPDATE public.pilot_ready_messages SET publish_lease_until=NULL,publish_retry_at=NOW()+INTERVAL '1 minute',
    last_error='scheduler_unavailable',updated_at=NOW() WHERE id=${job.id} AND status='pending'`;
  }
 }
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
  if(!party||party.status!=='called')error='party_not_called';
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
    const template=process.env.WHATSAPP_READY_TEMPLATE;
    const result=template&&/^[a-z0-9_]+$/.test(template)?await requestMetaTemplate({messaging_product:'whatsapp',to:phone,type:'template',biz_opaque_callback_data:id,
       template:{name:template,language:{code:process.env.WHATSAPP_TEMPLATE_LANGUAGE||'en'},components:[{type:'body',parameters:[{type:'text',text:party.name},{type:'text',text:String(party.id)}]}]}})
     :{state:'skipped',error:'approved_ready_template_required',messageId:undefined};
    state=result.state==='pending'?'failed':result.state;error=result.error??null;messageId=result.messageId??null;
   }
  }
  await tx`UPDATE public.pilot_ready_messages SET status=${state},last_error=${error},provider_message_id=${messageId},updated_at=NOW() WHERE id=${id}`;
 });
}
function safeTestPhone(){try{return normalizePhone(process.env.WHATSAPP_TEST_RECIPIENT||'');}catch{return null;}}

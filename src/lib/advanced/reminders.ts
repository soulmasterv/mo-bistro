import 'server-only';
import {randomUUID} from 'node:crypto';
import type {TransactionSql} from 'postgres';
import {getPostgres} from '@/lib/postgres-db';
import {advancedConfig,advancedEnabled,advancedPreview} from '@/lib/advanced/flags';
import {reminderCopy} from '@/lib/advanced/message-copy';
import {liveSendingEnabled,normalizePhone,whatsappEnabled} from '@/lib/whatsapp/policy';
import {requestMetaTemplate,publishAdvancedReminder} from '@/lib/whatsapp/transport';

export async function preNotifyBudget(tx:TransactionSql,guestId:number,notificationId:string|null=null,reminderId:string|null=null) {
 if(!advancedPreview())return true;
 await tx`SELECT pg_advisory_xact_lock(hashtext(${'advanced-pre-notify:'+guestId}))`;
 const [schema]=await tx`SELECT to_regclass('public.advanced_reminder_jobs') IS NOT NULL AS reminders`;
 // Turning reminders OFF does not erase messages already sent under that flag.
 const [row]=(schema?.reminders||advancedEnabled('reminders'))?await tx`SELECT
  (SELECT count(*) FROM whatsapp_notifications WHERE guest_id=${guestId} AND kind<>'review'
   AND id IS DISTINCT FROM ${notificationId}::uuid AND status IN ('sending','sent','unknown'))+
  (SELECT count(*) FROM advanced_reminder_jobs WHERE guest_id=${guestId}
   AND id IS DISTINCT FROM ${reminderId}::uuid AND status IN ('sending','sent','unknown')) AS used`
  :await tx`SELECT count(*) AS used FROM whatsapp_notifications WHERE guest_id=${guestId} AND kind<>'review'
   AND id IS DISTINCT FROM ${notificationId}::uuid AND status IN ('sending','sent','unknown')`;
 if(!row||!Number.isFinite(Number(row.used)))return false;
 return Number(row.used)<advancedConfig().preNotifyMax;
}

export async function prepareReminderJobs() {
 if(!advancedEnabled('reminders')||!whatsappEnabled())return;
 const {confirmationRequired}=await import('@/lib/confirmation-policy');
 const sql=getPostgres(),config=advancedConfig(),requireConfirmation=await confirmationRequired();
 await sql`INSERT INTO advanced_reminder_jobs(id,guest_id,kind,due_at)
  SELECT gen_random_uuid(),g.id,'timer',
   (CASE WHEN pg_input_is_valid(g.created_at,'timestamp with time zone') THEN g.created_at::timestamptz END)+${config.reminderMinutes}*INTERVAL '1 minute'
  FROM guests g WHERE g.status='waiting' AND pg_input_is_valid(g.created_at,'timestamp with time zone')
   AND NOT EXISTS(SELECT 1 FROM advanced_reminder_jobs r WHERE r.guest_id=g.id AND r.kind='timer')
  ORDER BY g.created_at,g.id LIMIT 100 ON CONFLICT(guest_id,kind) DO NOTHING`;
 const [head]=await sql`SELECT id FROM guests WHERE status='waiting' AND (${!requireConfirmation} OR confirmed=1)
  ORDER BY created_at,id LIMIT 1`;
 if(head)await sql`INSERT INTO advanced_reminder_jobs(id,guest_id,kind,due_at) VALUES(${randomUUID()},${head.id},'next',NOW()) ON CONFLICT(guest_id,kind) DO NOTHING`;
}

export const reminderText=reminderCopy;

export async function deliverReminder(id:string) {
 if(!advancedEnabled('reminders')||!whatsappEnabled())return;
 const {confirmationRequired}=await import('@/lib/confirmation-policy');
 const sql=getPostgres(),required=await confirmationRequired();
 const [claimed]=await sql`UPDATE advanced_reminder_jobs SET status='sending',attempts=attempts+1,updated_at=NOW()
  WHERE id=${id} AND status='pending' AND due_at<=NOW() RETURNING guest_id,kind`;
 if(!claimed){
  const [pending]=await sql`SELECT id FROM advanced_reminder_jobs WHERE id=${id} AND status IN ('pending','sending')`;
  return pending?'retry':undefined;
 }
 await sql.begin(async tx=>{
  const [booking]=await tx`SELECT g.id,g.name,g.status,g.created_at,c.phone,c.confirmation_consent,c.subscribed_at,c.unsubscribed_at
   FROM guests g LEFT JOIN whatsapp_booking_consents c ON c.guest_id=g.id WHERE g.id=${claimed.guest_id} FOR UPDATE OF g`;
  let state='skipped',reason:string|null=null,providerId:string|null=null;
  if(!booking||booking.status!=='waiting')reason='not_waiting';
  else if(!booking.confirmation_consent||!booking.subscribed_at||booking.unsubscribed_at||!booking.phone)reason='no_opt_in';
  else {
   await tx`SELECT pg_advisory_xact_lock(hashtext(${booking.phone}))`;
   const [stop]=await tx`SELECT opted_out_at FROM whatsapp_contact_preferences WHERE phone=${booking.phone}`;
   const [window]=await tx`SELECT last_inbound_at FROM whatsapp_customer_windows WHERE phone=${booking.phone}
    AND phone_number_id=${process.env.META_WHATSAPP_PHONE_NUMBER_ID||''}
    AND last_inbound_at>clock_timestamp()-INTERVAL '24 hours'+INTERVAL '10 seconds' AND last_inbound_at<=clock_timestamp()`;
   if(stop?.opted_out_at)reason='opted_out';
   else if(!window)reason='customer_window_closed';
   else if(process.env.WHATSAPP_WINDOW_TEXT_ENABLED!=='true')reason='window_text_disabled';
   else if(!await preNotifyBudget(tx,booking.id,null,id))reason='pre_notify_budget_exhausted';
   else {
    if(claimed.kind==='next'){
     const [head]=await tx`SELECT id FROM guests WHERE status='waiting' AND (${!required} OR confirmed=1) ORDER BY created_at,id LIMIT 1`;
     if(head?.id!==booking.id)reason='no_longer_next';
    }
    if(!reason){
     if(!liveSendingEnabled()){state='simulated';reason='test_mode';}
     else {
      let allowed=false;try{allowed=normalizePhone(process.env.WHATSAPP_TEST_RECIPIENT||'')===booking.phone;}catch{}
      if(!allowed)reason='preview_recipient_not_allowed';
      else {
       try{
        const result=await requestMetaTemplate({messaging_product:'whatsapp',to:booking.phone,type:'text',biz_opaque_callback_data:id,
         text:{body:reminderText(claimed.kind,booking.name,booking.id)}});
        state=result.state==='pending'?'failed':result.state;
        reason=result.error??(state==='sent'?'provider_accepted':state==='unknown'?'send_outcome_unconfirmed':'provider_'+state);
        providerId=result.messageId??null;
       }catch{state='unknown';reason='send_outcome_unconfirmed';}
      }
     }
    }
   }
  }
  await tx`UPDATE advanced_reminder_jobs SET status=${state},reason=${reason},provider_message_id=${providerId},updated_at=NOW() WHERE id=${id}`;
  await tx`INSERT INTO advanced_reminder_events(job_id,state,reason,provider_message_id) VALUES(${id},${state},${reason},${providerId})`;
 });
}

export async function dispatchReminders() {
 if(!advancedEnabled('reminders')||!whatsappEnabled())return;
 const sql=getPostgres();
 const interrupted=await sql`UPDATE advanced_reminder_jobs SET status='unknown',reason='worker_interrupted',updated_at=NOW()
  WHERE status='sending' AND updated_at<NOW()-INTERVAL '2 minutes' RETURNING id`;
 for(const row of interrupted)await sql`INSERT INTO advanced_reminder_events(job_id,state,reason) VALUES(${row.id},'unknown','worker_interrupted')`;
 await prepareReminderJobs();
 if(liveSendingEnabled()){
  // Persist future callbacks: the ten-minute reminder must not depend on an open staff tab.
  const scheduled=await sql`UPDATE advanced_reminder_jobs SET publish_lease_until=NOW()+INTERVAL '1 minute'
   WHERE id IN (SELECT id FROM advanced_reminder_jobs WHERE status='pending' AND qstash_message_id IS NULL
    AND (publish_lease_until IS NULL OR publish_lease_until<NOW())
    AND (publish_retry_at IS NULL OR publish_retry_at<=NOW()) ORDER BY due_at,id LIMIT 25 FOR UPDATE SKIP LOCKED)
   RETURNING id,due_at`;
  for(const job of scheduled){
   try{
    const result=await publishAdvancedReminder(job.id,new Date(job.due_at));
    await sql`UPDATE advanced_reminder_jobs SET qstash_message_id=${result.messageId},publish_lease_until=NULL,publish_retry_at=NULL WHERE id=${job.id}`;
   }catch{
    await sql`UPDATE advanced_reminder_jobs SET publish_lease_until=NULL,publish_retry_at=NOW()+INTERVAL '1 minute' WHERE id=${job.id}`;
    await sql`INSERT INTO advanced_reminder_events(job_id,state,reason) VALUES(${job.id},'failed','schedule_failed')`;
   }
  }
 }
 const jobs=await sql`SELECT id FROM advanced_reminder_jobs WHERE status='pending' AND due_at<=NOW() ORDER BY due_at,id LIMIT 25`;
 for(const row of jobs)await deliverReminder(row.id);
}

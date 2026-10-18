import 'server-only';
import type {TransactionSql} from 'postgres';
import type {NotificationKind} from '@/lib/whatsapp/policy';
import {requestMetaTemplate,type SendResult} from '@/lib/whatsapp/transport';
import {confirmationEstimate} from '@/lib/advanced/estimates';
import {acknowledgement,etaCopy,nearlyReadyCopy,reviewCopy} from '@/lib/advanced/message-copy';
export async function sendAdvancedPlain(tx:TransactionSql,job:{id:string;kind:NotificationKind;guest_id:number},
 booking:{phone:string;name:string;eta_at?:Date|null;subscribed_at?:Date|null}):Promise<SendResult>{
 if(process.env.WHATSAPP_WINDOW_TEXT_ENABLED!=='true')return {state:'skipped',error:'window_text_disabled'};
 if(!booking.subscribed_at)return {state:'skipped',error:'subscription_required'};
 const business=process.env.META_WHATSAPP_PHONE_NUMBER_ID;
 if(!business)return {state:'skipped',error:'business_number_not_configured'};
 let open=false;
 try{
  const [window]=await tx`SELECT last_inbound_at FROM whatsapp_customer_windows WHERE phone=${booking.phone}
   AND phone_number_id=${business} AND last_inbound_at>clock_timestamp()-INTERVAL '24 hours'+INTERVAL '10 seconds'
   AND last_inbound_at<=clock_timestamp()`;
  open=!!window;
 }catch{return {state:'skipped',error:'customer_window_schema_unavailable'};}
 if(!open)return {state:'skipped',error:'customer_window_closed'};
 let body:string;
 switch(job.kind){
  case 'confirmation':body=acknowledgement(booking.name,job.guest_id,await confirmationEstimate(tx,job.id,job.guest_id));break;
  case 'eta_update':{
   const remaining=booking.eta_at?Math.ceil((new Date(booking.eta_at).getTime()-Date.now())/60000):NaN;
   if(!Number.isFinite(remaining)||remaining<1||remaining>240)return {state:'skipped',error:'eta_expired_or_invalid'};
   body=etaCopy(booking.name,job.guest_id,remaining);break;
  }
  case 'almost_ready':{
   const remaining=booking.eta_at?(new Date(booking.eta_at).getTime()-Date.now())/60000:NaN;
   if(!Number.isFinite(remaining)||remaining<8||remaining>10.1)return {state:'skipped',error:'manual_estimate_stale'};
   body=nearlyReadyCopy(booking.name,job.guest_id);break;
  }
  case 'review':body=reviewCopy(booking.name);break;
 }
 if(job.kind==='review')return requestMetaTemplate({messaging_product:'whatsapp',to:booking.phone,type:'interactive',
  biz_opaque_callback_data:job.id,interactive:{type:'button',body:{text:body},action:{buttons:[
   {type:'reply',reply:{id:'review_placeholder',title:'Leave a review'}},
  ]}}});
 return requestMetaTemplate({messaging_product:'whatsapp',to:booking.phone,type:'text',biz_opaque_callback_data:job.id,text:{body}});
}

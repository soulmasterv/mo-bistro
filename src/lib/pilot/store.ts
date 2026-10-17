import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { getPostgres } from "@/lib/postgres-db";

export const PartyInput = z.object({
 name:z.string().trim().min(2).max(100).refine(v=>!/[\x00-\x1f\x7f]/.test(v)),
 phone:z.string().trim().regex(/^01[0125]\d{8}$/),
 party_size:z.number().int().min(1).max(30),
 preference:z.enum(['indoor','outdoor']),
 whatsapp_consent:z.boolean().default(false),
}).strict();
export function tokenHash(token:string) { return createHash('sha256').update(token).digest('hex'); }
export const validToken=(token:unknown):token is string=>typeof token==='string'&&/^[a-f0-9]{64}$/.test(token);

export async function createParty(input:z.infer<typeof PartyInput>,source:'qr'|'walk_in') {
 await finalizePendingExits();
 const token=randomBytes(32).toString('hex');
 const [party]=await getPostgres()`INSERT INTO public.pilot_parties(name,phone,party_size,preference,source,tracking_hash,whatsapp_consent_at)
 VALUES(${input.name},${input.phone},${input.party_size},${input.preference},${source},${tokenHash(token)},
 CASE WHEN ${source==='qr'&&input.whatsapp_consent} THEN clock_timestamp() ELSE NULL END)
 ON CONFLICT(phone) WHERE status IN ('waiting','called') DO NOTHING RETURNING id`;
 return party?{id:party.id,token}:null;
}
export async function finalizePendingExits() {
 await getPostgres()`UPDATE public.pilot_parties SET status='left',left_at=pending_exit_at,
 exit_state=status,exit_reason=CASE WHEN pending_exit_kind='no_show' THEN 'no_show_after_call' WHEN pending_exit_kind='cancel' THEN 'cancelled_before_call' ELSE pending_exit_kind END,
 pending_exit_kind=NULL,pending_exit_at=NULL,pending_exit_token=NULL
 WHERE pending_exit_at<=clock_timestamp() AND status IN ('waiting','called')`;
}
export async function undoExit(id:number,token:string) {
 await finalizePendingExits();
 const rows=await getPostgres()`UPDATE public.pilot_parties SET pending_exit_kind=NULL,pending_exit_at=NULL,pending_exit_token=NULL
 WHERE id=${id} AND pending_exit_token=${token} AND pending_exit_at>clock_timestamp()
 AND status IN ('waiting','called') RETURNING id`;
 return rows.length?{success:true}:{error:'The five-second undo window has ended.',status:409};
}
export const ExitReason = z.enum(['guest_cancelled','left_unannounced','no_response','duplicate_test']);
export type PilotAction='call'|'notify'|'retry'|'seated'|'left'|'cancel'|'no_show'|'remove'|'phone_call'|'guest_informed';
export async function transition(id:number,action:PilotAction,reason?:z.infer<typeof ExitReason>,eventId?:string) {
 await finalizePendingExits();
 return getPostgres().begin(async tx=>{
  const [party]=await tx`SELECT * FROM public.pilot_parties WHERE id=${id} FOR UPDATE`;
  if(!party) return {error:'Party not found',status:404};
  const normalized=action==='call'?'notify':action==='remove'?reason:action==='left'?'left_unannounced':action==='cancel'?'guest_cancelled':action==='no_show'?'no_response':action;
  if(!normalized)return {error:'Choose a removal reason.',status:400};
  const exiting=ExitReason.safeParse(normalized).success;
  if(party.pending_exit_kind){
   if(party.pending_exit_kind===normalized)return {success:true,undo_token:party.pending_exit_token,undo_until:party.pending_exit_at};
   return {error:'Undo the pending removal before taking another action.',status:409};
  }
  if(normalized==='seated'&&party.status==='seated')return {success:true};
  if(!['waiting','called'].includes(party.status))
   return {error:'This party has already left the waiting queue.',status:409};
  if(exiting){
   const [exit]=await tx`UPDATE public.pilot_parties SET pending_exit_kind=${normalized},pending_exit_at=clock_timestamp()+INTERVAL '5 seconds',pending_exit_token=${randomUUID()} WHERE id=${id} RETURNING pending_exit_at,pending_exit_token`;
   return {success:true,undo_token:exit.pending_exit_token,undo_until:exit.pending_exit_at};
  }
  const [latest]=await tx`SELECT * FROM public.pilot_ready_messages WHERE party_id=${id} ORDER BY created_at DESC,id DESC LIMIT 1`;
  if(normalized==='phone_call'){
   if(!eventId)return {error:'Missing call event.',status:400};
   const inserted=await tx`INSERT INTO public.pilot_phone_taps(id,party_id) VALUES(${eventId},${id}) ON CONFLICT(id) DO NOTHING RETURNING id`;
   if(inserted.length)await tx`UPDATE public.pilot_parties SET phone_call_taps=phone_call_taps+1,last_phone_call_at=clock_timestamp() WHERE id=${id}`;
  } else if(normalized==='guest_informed'){
   if(party.status==='called')return {success:true};
   const fallback=!party.whatsapp_consent_at||['failed','unknown','skipped','simulated'].includes(latest?.status)||(latest?.status==='pending'&&latest.last_error==='scheduler_unavailable');
   if(!fallback||!party.phone_call_taps)return {error:'Call the guest first, then confirm only after speaking to them.',status:409};
   await tx`UPDATE public.pilot_parties SET status='called',called_at=clock_timestamp(),informed_via='staff_confirmed' WHERE id=${id}`;
   await tx`UPDATE public.pilot_ready_messages SET status='skipped',last_error='staff_informed',updated_at=clock_timestamp() WHERE party_id=${id} AND status IN ('pending','scheduled')`;
  } else if(normalized==='notify'||normalized==='retry') {
   if(party.status==='called')return {success:true};
   if(normalized==='retry'){
    if(!eventId)return {error:'Missing retry event.',status:400};
    const previous=await tx`SELECT id FROM public.pilot_ready_messages WHERE id=${eventId} AND party_id=${id}`;
    if(previous.length)return {success:true};
   }
   if(latest&&normalized==='notify')return {success:true};
   if(normalized==='retry'&&(!latest||!['failed','skipped','simulated'].includes(latest.status)))
    return {error:'This send cannot safely be retried. Call the guest instead.',status:409};
   await tx`INSERT INTO public.pilot_ready_messages(id,party_id,status,last_error) VALUES(${eventId||randomUUID()},${id},${party.whatsapp_consent_at?'pending':'skipped'},${party.whatsapp_consent_at?null:'guest_not_opted_in'})`;
  } else await tx`UPDATE public.pilot_parties SET status='seated',seated_at=clock_timestamp() WHERE id=${id}`;
  return {success:true};
 });
}
export async function observeOptInReplies() {
 // Evidence of an inbound message after this booking's consent; not proof the prepared text was sent.
 await getPostgres()`UPDATE public.pilot_parties p SET whatsapp_inbound_after_opt_in_at=w.last_inbound_at
 FROM public.whatsapp_customer_windows w WHERE w.phone='2'||p.phone
 AND w.phone_number_id=${process.env.META_WHATSAPP_PHONE_NUMBER_ID||''}
 AND p.whatsapp_consent_at IS NOT NULL AND p.whatsapp_inbound_after_opt_in_at IS NULL
 AND w.last_inbound_at>=p.whatsapp_consent_at AND w.last_inbound_at<=clock_timestamp()
 AND (COALESCE(p.left_at,p.seated_at) IS NULL OR w.last_inbound_at<=COALESCE(p.left_at,p.seated_at))`;
}
export async function listQueue() {
 await finalizePendingExits();
 await observeOptInReplies();
 return getPostgres()`SELECT p.id,p.name,p.phone,p.party_size,p.preference,p.source,p.status,p.joined_at,
 p.called_at,p.whatsapp_consent_at IS NOT NULL AS whatsapp_consent,p.pending_exit_kind,p.pending_exit_at,p.pending_exit_token,
 p.phone_call_taps,p.informed_via,p.whatsapp_inbound_after_opt_in_at,m.status AS message_status,m.last_error AS message_error
 FROM public.pilot_parties p LEFT JOIN LATERAL (SELECT status,last_error FROM public.pilot_ready_messages WHERE party_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) m ON TRUE
 WHERE p.status IN ('waiting','called') ORDER BY p.joined_at,p.id`;
}
export async function partyStatus(token:string) {
 await finalizePendingExits();
 await observeOptInReplies();
 const [party]=await getPostgres()`SELECT p.id,p.status,p.whatsapp_consent_at IS NOT NULL AS whatsapp_consent,
 p.whatsapp_inbound_after_opt_in_at IS NOT NULL AS whatsapp_reply_observed,
 CASE WHEN p.status='waiting' THEN (SELECT count(*)::integer FROM public.pilot_parties ahead
 WHERE ahead.status='waiting' AND (ahead.joined_at,ahead.id)<=(p.joined_at,p.id)) ELSE NULL END AS position
 FROM public.pilot_parties p WHERE p.tracking_hash=${tokenHash(token)}`;
 return party??null;
}
export async function enableReadyAlert(token:string) {
 const rows=await getPostgres()`UPDATE public.pilot_parties SET whatsapp_consent_at=COALESCE(whatsapp_consent_at,clock_timestamp())
 WHERE tracking_hash=${tokenHash(token)} AND status='waiting' RETURNING id`;
 return rows.length>0;
}
export function readyAlertLink(id:number) {
 const number=(process.env.WHATSAPP_BUSINESS_NUMBER||'').replace(/[^0-9]/g,'');
 return /^[1-9]\d{7,14}$/.test(number)?`https://wa.me/${number}?text=${encodeURIComponent(`Please send my table-ready message for Mo Bistro pilot ticket #${id}.`)}`:null;
}
export async function exportRows() {
 await finalizePendingExits();
 await observeOptInReplies();
 return getPostgres()`SELECT p.id,p.joined_at,p.called_at,p.seated_at,p.left_at,p.party_size,p.preference,p.source,p.status,p.exit_reason,p.exit_state,
 p.whatsapp_consent_at,p.whatsapp_inbound_after_opt_in_at,p.phone_call_taps,p.last_phone_call_at,p.informed_via,
 (SELECT count(*)::integer FROM public.pilot_ready_messages m WHERE m.party_id=p.id) AS notification_attempts,
 (SELECT string_agg(m.status, ' | ' ORDER BY m.created_at,m.id) FROM public.pilot_ready_messages m WHERE m.party_id=p.id) AS notification_outcomes,
 (SELECT json_agg(json_build_object('requested_at',m.created_at,'updated_at',m.updated_at,'outcome',m.status,'error',m.last_error,'send_attempts',m.attempts) ORDER BY m.created_at,m.id)::text FROM public.pilot_ready_messages m WHERE m.party_id=p.id) AS notification_history
 FROM public.pilot_parties p WHERE p.exit_reason IS DISTINCT FROM 'duplicate_test' ORDER BY p.joined_at,p.id LIMIT 50001`;
}
export function csv(rows:Record<string,unknown>[]) {
 const columns=['id','joined_at','called_at','seated_at','left_at','party_size','preference','source','status','exit_reason','exit_state','whatsapp_consent_at','whatsapp_inbound_after_opt_in_at','phone_call_taps','last_phone_call_at','informed_via','notification_attempts','notification_outcomes','notification_history'];
 const value=(v:unknown)=>'"'+String(v instanceof Date?v.toISOString():v??'').replaceAll('"','""')+'"';
 return columns.join(',')+'\r\n'+rows.map(row=>columns.map(key=>value(row[key])).join(',')).join('\r\n')+'\r\n';
}

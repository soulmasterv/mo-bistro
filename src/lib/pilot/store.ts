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
 exit_reason=CASE WHEN pending_exit_kind='no_show' THEN 'no_show_after_call' ELSE 'cancelled_before_call' END,
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
export async function transition(id:number,action:'call'|'notify'|'seated'|'left'|'cancel'|'no_show') {
 await finalizePendingExits();
 return getPostgres().begin(async tx=>{
  const [party]=await tx`SELECT id,status,called_at,whatsapp_consent_at,pending_exit_kind,pending_exit_at,pending_exit_token FROM public.pilot_parties WHERE id=${id} FOR UPDATE`;
  if(!party) return {error:'Party not found',status:404};
  const normalized=action==='call'?'notify':action==='left'?(party.called_at?'no_show':'cancel'):action;
  const exiting=normalized==='cancel'||normalized==='no_show';
  if(party.pending_exit_kind){
   if(party.pending_exit_kind===normalized)return {success:true,undo_token:party.pending_exit_token,undo_until:party.pending_exit_at};
   return {error:'Undo the pending removal before taking another action.',status:409};
  }
  const target=normalized==='notify'?'called':normalized==='seated'?'seated':'left';
  if(party.status===target) return {success:true};
  if(!['waiting','called'].includes(party.status)||(normalized==='notify'&&party.status!=='waiting'))
   return {error:'This party has already left the waiting queue.',status:409};
  if(exiting){
   if(normalized==='no_show'&&!party.called_at)return {error:'No-show applies after the party has been notified.',status:409};
   if(normalized==='cancel'&&party.called_at)return {error:'Use No-show for a party that has already been notified.',status:409};
   const [exit]=await tx`UPDATE public.pilot_parties SET pending_exit_kind=${normalized},pending_exit_at=clock_timestamp()+INTERVAL '5 seconds',pending_exit_token=${randomUUID()} WHERE id=${id} RETURNING pending_exit_at,pending_exit_token`;
   return {success:true,undo_token:exit.pending_exit_token,undo_until:exit.pending_exit_at};
  }
  if(normalized==='notify') {
   await tx`UPDATE public.pilot_parties SET status='called',called_at=clock_timestamp() WHERE id=${id}`;
   await tx`INSERT INTO public.pilot_ready_messages(id,party_id,status,last_error) VALUES(${randomUUID()},${id},${party.whatsapp_consent_at?'pending':'skipped'},${party.whatsapp_consent_at?null:'guest_not_opted_in'}) ON CONFLICT(party_id) DO NOTHING`;
  } else await tx`UPDATE public.pilot_parties SET status='seated',seated_at=clock_timestamp() WHERE id=${id}`;
  return {success:true};
 });
}
export async function listQueue() {
 await finalizePendingExits();
 return getPostgres()`SELECT p.id,p.name,p.phone,p.party_size,p.preference,p.source,p.status,p.joined_at,
 p.called_at,p.whatsapp_consent_at IS NOT NULL AS whatsapp_consent,p.pending_exit_kind,p.pending_exit_at,p.pending_exit_token,
 m.status AS message_status,m.last_error AS message_error
 FROM public.pilot_parties p LEFT JOIN public.pilot_ready_messages m ON m.party_id=p.id
 WHERE p.status IN ('waiting','called') ORDER BY p.joined_at,p.id`;
}
export async function partyStatus(token:string) {
 await finalizePendingExits();
 const [party]=await getPostgres()`SELECT p.id,p.status,p.whatsapp_consent_at IS NOT NULL AS whatsapp_consent,
 CASE WHEN p.status='waiting' THEN (SELECT count(*)::integer FROM public.pilot_parties ahead
 WHERE ahead.status='waiting' AND (ahead.joined_at,ahead.id)<=(p.joined_at,p.id)) ELSE NULL END AS position
 FROM public.pilot_parties p WHERE p.tracking_hash=${tokenHash(token)}`;
 return party??null;
}
export async function enableReadyAlert(token:string) {
 const rows=await getPostgres()`UPDATE public.pilot_parties SET whatsapp_consent_at=clock_timestamp()
 WHERE tracking_hash=${tokenHash(token)} AND status='waiting' RETURNING id`;
 return rows.length>0;
}
export function readyAlertLink(id:number) {
 const number=(process.env.WHATSAPP_BUSINESS_NUMBER||'').replace(/[^0-9]/g,'');
 return /^[1-9]\d{7,14}$/.test(number)?`https://wa.me/${number}?text=${encodeURIComponent(`Please send my table-ready message for Mo Bistro pilot ticket #${id}.`)}`:null;
}
export async function exportRows() {
 await finalizePendingExits();
 return getPostgres()`SELECT id,joined_at,called_at,seated_at,left_at,party_size,preference,source,status,exit_reason
 FROM public.pilot_parties ORDER BY joined_at,id LIMIT 50001`;
}
export function csv(rows:Record<string,unknown>[]) {
 const columns=['id','joined_at','called_at','seated_at','left_at','party_size','preference','source','status','exit_reason'];
 const value=(v:unknown)=>'"'+String(v instanceof Date?v.toISOString():v??'').replaceAll('"','""')+'"';
 return columns.join(',')+'\r\n'+rows.map(row=>columns.map(key=>value(row[key])).join(',')).join('\r\n')+'\r\n';
}

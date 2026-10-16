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
 const token=randomBytes(32).toString('hex');
 const [party]=await getPostgres()`INSERT INTO public.pilot_parties(name,phone,party_size,preference,source,tracking_hash,whatsapp_consent_at)
 VALUES(${input.name},${input.phone},${input.party_size},${input.preference},${source},${tokenHash(token)},
 CASE WHEN ${source==='qr'&&input.whatsapp_consent} THEN clock_timestamp() ELSE NULL END)
 ON CONFLICT(phone) WHERE status IN ('waiting','called') DO NOTHING RETURNING id`;
 return party?{id:party.id,token}:null;
}
export async function transition(id:number,action:'call'|'seated'|'left') {
 return getPostgres().begin(async tx=>{
  const [party]=await tx`SELECT id,status FROM public.pilot_parties WHERE id=${id} FOR UPDATE`;
  if(!party) return {error:'Party not found',status:404};
  const target={call:'called',seated:'seated',left:'left'}[action];
  if(party.status===target) return {success:true};
  if(!['waiting','called'].includes(party.status)||(action==='call'&&party.status!=='waiting'))
   return {error:'This party has already left the waiting queue.',status:409};
  if(action==='call') {
   await tx`UPDATE public.pilot_parties SET status='called',called_at=clock_timestamp() WHERE id=${id}`;
   await tx`INSERT INTO public.pilot_ready_messages(id,party_id) VALUES(${randomUUID()},${id}) ON CONFLICT(party_id) DO NOTHING`;
  } else if(action==='seated') await tx`UPDATE public.pilot_parties SET status='seated',seated_at=clock_timestamp() WHERE id=${id}`;
  else await tx`UPDATE public.pilot_parties SET status='left',left_at=clock_timestamp() WHERE id=${id}`;
  return {success:true};
 });
}
export async function listQueue() {
 return getPostgres()`SELECT p.id,p.name,p.phone,p.party_size,p.preference,p.source,p.status,p.joined_at,
 p.called_at,m.status AS message_status,m.last_error AS message_error
 FROM public.pilot_parties p LEFT JOIN public.pilot_ready_messages m ON m.party_id=p.id
 WHERE p.status IN ('waiting','called') ORDER BY p.joined_at,p.id`;
}
export async function partyStatus(token:string) {
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
 return getPostgres()`SELECT id,joined_at,called_at,seated_at,left_at,party_size,preference,source,status
 FROM public.pilot_parties ORDER BY joined_at,id LIMIT 50001`;
}
export function csv(rows:Record<string,unknown>[]) {
 const columns=['id','joined_at','called_at','seated_at','left_at','party_size','preference','source','status'];
 const value=(v:unknown)=>'"'+String(v instanceof Date?v.toISOString():v??'').replaceAll('"','""')+'"';
 return columns.join(',')+'\r\n'+rows.map(row=>columns.map(key=>value(row[key])).join(',')).join('\r\n')+'\r\n';
}

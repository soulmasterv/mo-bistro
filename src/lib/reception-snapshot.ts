import 'server-only';
import {getPostgres} from '@/lib/postgres-db';
import {chooseDistinctGuests} from '@/lib/next-guest-suggestions';
import {resolveConfirmation} from '@/lib/confirmation-policy';
import {advancedEnabled} from '@/lib/advanced/flags';

// One consistent read, with shared inventory and queue rows reused for every panel.
// No notification dispatch, pending-job processing, schema probes or writes here.
export async function receptionSnapshot(){
 return getPostgres().begin(async tx=>{
  await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;
  const settings=await tx`SELECT key,value FROM seating_settings WHERE key IN ('table_view_mode','allow_area_override','restaurant_wait_minutes')
   UNION ALL SELECT key,value FROM restaurant_settings WHERE key IN ('approval_required','require_confirmation')`;
  const value=(key:string)=>settings.find(r=>r.key===key)?.value;
  const mode=value('table_view_mode')==='simple'?'simple':'detailed';
  const required=resolveConfirmation({approval_required:value('approval_required'),require_confirmation:value('require_confirmation')});
  const rawGuests=await tx`SELECT g.id,g.name,g.phone,g.party_size,g.seating_preference,g.status,g.confirmed,g.table_id,
   g.created_at,g.updated_at,to_jsonb(g)->>'eta_at' AS eta_at FROM guests g ORDER BY g.created_at,g.id`;
  const tables=await tx`SELECT id,name,seats,area,status,updated_at FROM restaurant_tables
   WHERE (to_jsonb(restaurant_tables)->>'advanced_archived_at') IS NULL ORDER BY id`;
  const pools=mode==='simple'?await tx`SELECT area,total_tables,occupied_tables,max_party_size,
   total_tables-occupied_tables AS free_tables FROM simple_table_capacity ORDER BY area`:[];
  const rawRequests=await tx`SELECT r.id,COALESCE(to_jsonb(r)->>'inventory_mode','detailed') AS inventory_mode,
   r.table_id,NULLIF(to_jsonb(r)->>'area','') AS request_area,r.status,r.requested_at,COALESCE(u.username,'Staff') AS requested_by
   FROM table_ready_requests r LEFT JOIN staff_users u ON u.id=r.requested_by WHERE r.status='pending' ORDER BY r.requested_at,r.id`;
  const requests=rawRequests.map(r=>{
   const table=tables.find(t=>t.id===r.table_id),area=table?.area??r.request_area;
   return {...r,table_name:table?.name??(area?area[0].toUpperCase()+area.slice(1)+' area':null),area,seats:table?.seats??null};
  });
  const blocked=mode==='simple'&&tables.some(t=>t.status==='occupied');
  const areas=['indoor','outdoor'].map(area=>({area,seats:mode==='simple'
   ?blocked?0:Number(pools.find(p=>p.area===area&&p.free_tables>0)?.max_party_size??0)
   :Math.max(0,...tables.filter(t=>t.area===area&&t.status==='free').map(t=>Number(t.seats)))}));
  const candidates=rawGuests.filter(g=>['waiting','called'].includes(g.status)).map(g=>({id:Number(g.id),name:String(g.name),party_size:Number(g.party_size),seating_preference:String(g.seating_preference)}));
  const next=chooseDistinctGuests(areas,candidates,(value('allow_area_override')??'true')==='true');
  const counts=advancedEnabled('tableOverride')?await tx`SELECT area,available_count FROM advanced_table_overrides`:null;
  const guests=rawGuests.map(g=>({...g,confirmation_required:required,...(counts?{fits_available:g.status==='waiting'&&counts.some(c=>
   c.available_count>0&&(g.seating_preference==='any'||g.seating_preference===c.area)&&tables.some(t=>t.area===c.area&&t.seats>=g.party_size))}:{})}));
  const minutes=Number(value('restaurant_wait_minutes')??30);
  return {guests,tables,requests,next:{areas:next},mode:{mode},
   wait:{minutes:Number.isInteger(minutes)&&minutes>=15&&minutes<=240&&minutes%15===0?minutes:30},
   simple:{areas:pools,blocked_by_named_inventory:blocked,warning:blocked?'Named tables are still occupied. Switch to Detailed Mode and clear them before using anonymous inventory.':null}};
 });
}

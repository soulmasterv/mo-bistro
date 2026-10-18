import 'server-only';
import {getPostgres} from '@/lib/postgres-db';
import type {StaffSession} from '@/lib/staff-auth';
export type TableDetails={name:string;seats:number;area:'indoor'|'outdoor'};
export class TableConflict extends Error {}

export async function changeTable(actor:StaffSession,details:TableDetails|null,id?:number,revision?:number){
 if(actor.role!=='manager')throw new TableConflict('Administrator access required.');
 return getPostgres().begin(async tx=>{
  // Match the existing seating lock so edits cannot race with seating.
  await tx`SELECT pg_advisory_xact_lock(741122)`;
  let before=null,after;
  if(id!==undefined){
   [before]=await tx`SELECT id,name,seats,area,status,advanced_revision FROM restaurant_tables
    WHERE id=${id} AND advanced_archived_at IS NULL FOR UPDATE`;
   if(!before||before.status!=='free')throw new TableConflict('Only existing, free tables can be changed.');
   if(revision!==undefined&&before.advanced_revision!==revision)throw new TableConflict('Table changed. Refresh before saving.');
   const assigned=await tx`SELECT id FROM guests WHERE table_id=${id} AND status='seated' LIMIT 1`;
   if(assigned.length)throw new TableConflict('Table is assigned to a seated party.');
   if(details)[after]=await tx`UPDATE restaurant_tables SET name=${details.name},seats=${details.seats},area=${details.area},
    advanced_revision=advanced_revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=${id}
    RETURNING id,name,seats,area,status,advanced_revision`;
   else [after]=await tx`UPDATE restaurant_tables SET advanced_archived_at=NOW(),advanced_revision=advanced_revision+1,
    updated_at=CURRENT_TIMESTAMP WHERE id=${id} RETURNING id,name,seats,area,status,advanced_revision,advanced_archived_at`;
  }else{
   if(!details)throw new TableConflict('Table details required.');
   [after]=await tx`INSERT INTO restaurant_tables(name,seats,area) VALUES(${details.name},${details.seats},${details.area})
    RETURNING id,name,seats,area,status,advanced_revision`;
  }
  await tx`INSERT INTO advanced_table_events(table_id,area,action,actor_staff_id,actor_username,before_value,after_value)
   VALUES(${after.id},${after.area},${id===undefined?'add':details?'edit':'archive'},${actor.id},${actor.username},
    ${before?JSON.stringify(before):null}::jsonb,${JSON.stringify(after)}::jsonb)`;
  return after;
 });
}

export async function setTableOverride(actor:StaffSession,area:'indoor'|'outdoor',count:number,revision:number){
 if(!['manager','reception'].includes(actor.role))throw new TableConflict('Reception access required.');
 return getPostgres().begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(hashtext(${'advanced-override:'+area}))`;
  const [before]=await tx`SELECT area,available_count,revision FROM advanced_table_overrides WHERE area=${area} FOR UPDATE`;
  if((before?.revision??0)!==revision)throw new TableConflict('Count changed. Refresh before saving.');
  const [after]=await tx`INSERT INTO advanced_table_overrides(area,available_count,revision,actor_staff_id)
   VALUES(${area},${count},1,${actor.id}) ON CONFLICT(area) DO UPDATE SET available_count=EXCLUDED.available_count,
    revision=advanced_table_overrides.revision+1,actor_staff_id=EXCLUDED.actor_staff_id,updated_at=NOW()
   RETURNING area,available_count,revision`;
  await tx`INSERT INTO advanced_table_events(area,action,actor_staff_id,actor_username,before_value,after_value)
   VALUES(${area},'override',${actor.id},${actor.username},${before?JSON.stringify(before):null}::jsonb,${JSON.stringify(after)}::jsonb)`;
  return after;
 });
}

export async function availableFit(guests:{id:number;party_size:number;seating_preference:string;status:string}[]){
 const sql=getPostgres();
 const counts=await sql`SELECT area,available_count FROM advanced_table_overrides`;
 // Counters describe availability only. Capacity comes from the configured table inventory.
 const capacities=await sql`SELECT area,MAX(seats) AS seats FROM restaurant_tables WHERE advanced_archived_at IS NULL GROUP BY area`;
 const fits=new Set<number>();
 for(const guest of guests){
  if(guest.status!=='waiting')continue;
  if(counts.some(c=>Number(c.available_count)>0&&(guest.seating_preference==='any'||guest.seating_preference===c.area)
    &&capacities.some(t=>t.area===c.area&&Number(t.seats)>=guest.party_size)))fits.add(guest.id);
 }
 return fits;
}

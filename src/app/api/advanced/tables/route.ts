import {z} from 'zod';
import {advancedEnabled} from '@/lib/advanced/flags';
import {getPostgres} from '@/lib/postgres-db';
import {currentStaff} from '@/lib/staff-auth';
import {rejectCrossOrigin} from '@/lib/guest-api-security';
import {changeTable,TableConflict} from '@/lib/advanced/tables';
const details=z.object({name:z.string().trim().min(1).max(40),seats:z.number().int().min(1).max(30),area:z.enum(['indoor','outdoor'])});
const existing=z.object({id:z.number().int().positive(),revision:z.number().int().nonnegative()});
export async function GET(){
 if(!advancedEnabled('tableEditor'))return Response.json({error:'Disabled'},{status:404});
 if((await currentStaff())?.role!=='manager')return Response.json({error:'Forbidden'},{status:403});
 const rows=await getPostgres()`SELECT id,name,seats,area,status,advanced_revision FROM restaurant_tables WHERE advanced_archived_at IS NULL ORDER BY id`;
 return Response.json(rows,{headers:{'Cache-Control':'no-store'}});
}
async function mutate(request:Request,method:'POST'|'PATCH'|'DELETE'){
 if(!advancedEnabled('tableEditor'))return Response.json({error:'Disabled'},{status:404});
 const actor=await currentStaff();
 if(actor?.role!=='manager')return Response.json({error:'Forbidden'},{status:403});
 const origin=rejectCrossOrigin(request);if(origin)return origin;
 const schema=method==='POST'?details.strict():method==='PATCH'?details.extend(existing.shape).strict():existing.strict();
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:'Check table details.'},{status:400});
 try{
  const data=parsed.data;
  const result=await changeTable(actor,method==='DELETE'?null:details.parse(data),'id' in data?data.id:undefined,'revision' in data?data.revision:undefined);
  return Response.json(result,{status:method==='POST'?201:200});
 }catch(error){return Response.json({error:error instanceof TableConflict?error.message:'Unable to save table. Check for a duplicate name.'},{status:409});}
}
export const POST=(request:Request)=>mutate(request,'POST');
export const PATCH=(request:Request)=>mutate(request,'PATCH');
export const DELETE=(request:Request)=>mutate(request,'DELETE');

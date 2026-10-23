import {z} from 'zod';
import {advancedEnabled} from '@/lib/advanced/flags';
import {getPostgres} from '@/lib/postgres-db';
import {currentStaff} from '@/lib/staff-auth';
import {rejectCrossOrigin} from '@/lib/guest-api-security';
import {setTableOverride,TableConflict} from '@/lib/advanced/tables';
export async function GET(){
 if(!advancedEnabled('tableOverride'))return Response.json({error:'Disabled'},{status:404});
 const staff=await currentStaff();
 if(!staff||!['manager','reception'].includes(staff.role))return Response.json({error:'Forbidden'},{status:403});
 const rows=await getPostgres()`SELECT area,available_count,revision,updated_at FROM advanced_table_overrides ORDER BY area`;
 return Response.json(rows,{headers:{'Cache-Control':'no-store'}});
}
const schema=z.object({area:z.enum(['indoor','outdoor']),available_count:z.number().int().min(0).max(500),revision:z.number().int().nonnegative()}).strict();
export async function PUT(request:Request){
 if(!advancedEnabled('tableOverride'))return Response.json({error:'Disabled'},{status:404});
 const actor=await currentStaff();
 if(!actor||!['manager','reception'].includes(actor.role))return Response.json({error:'Forbidden'},{status:403});
 const origin=rejectCrossOrigin(request);if(origin)return origin;
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:'Enter a whole count from 0 to 500.'},{status:400});
 try{return Response.json(await setTableOverride(actor,parsed.data.area,parsed.data.available_count,parsed.data.revision));}
 catch(error){return Response.json({error:error instanceof TableConflict?error.message:'Unable to save count.'},{status:409});}
}

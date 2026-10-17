import { z } from 'zod';
import { after } from 'next/server';
import { transition,undoExit,ExitReason } from '@/lib/pilot/store';
import { pilotStaff,pilotOrigin,pilotUnavailable } from '@/lib/pilot/http';
import { publishPilotCalls } from '@/lib/pilot/whatsapp';
import { timedPilotRoute } from '@/lib/pilot/timing';
const Input=z.object({action:z.enum(['notify','retry','call','seated','left','cancel','no_show','remove','phone_call','guest_informed','undo']),undo_token:z.uuid().optional(),reason:ExitReason.optional(),event_id:z.uuid().optional()}).strict()
 .refine(v=>(v.action!=='undo'||!!v.undo_token)&&(v.action!=='remove'||!!v.reason)&&(!['phone_call','retry'].includes(v.action)||!!v.event_id));
export const maxDuration=30;
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}) {
 return timedPilotRoute(async db=>{
 const denied=await db(()=>pilotStaff());if(denied)return denied;const origin=pilotOrigin(request);if(origin)return origin;
 const id=Number((await context.params).id),input=Input.safeParse(await request.json().catch(()=>null));
 if(!Number.isSafeInteger(id)||id<1||!input.success)return Response.json({error:'Invalid action.'},{status:400});
 try{const result=await db(()=>input.data.action==='undo'?undoExit(id,input.data.undo_token!):transition(id,input.data.action,input.data.reason,input.data.event_id));if('error'in result)return Response.json(result,{status:result.status});
  if(['call','notify','retry'].includes(input.data.action))await publishPilotCalls(id);
  if(input.data.action==='undo')after(async()=>{try{await publishPilotCalls(id);}catch{}});
  return Response.json(result);
 }catch{return pilotUnavailable();}
 });
}

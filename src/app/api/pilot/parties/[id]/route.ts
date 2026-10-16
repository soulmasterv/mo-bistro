import { z } from 'zod';
import { after } from 'next/server';
import { transition,undoExit } from '@/lib/pilot/store';
import { pilotStaff,pilotOrigin,pilotUnavailable } from '@/lib/pilot/http';
import { publishPilotCalls } from '@/lib/pilot/whatsapp';
const Input=z.object({action:z.enum(['notify','call','seated','left','cancel','no_show','undo']),undo_token:z.uuid().optional()}).strict().refine(v=>v.action!=='undo'||!!v.undo_token);
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}) {
 const denied=await pilotStaff();if(denied)return denied;const origin=pilotOrigin(request);if(origin)return origin;
 const id=Number((await context.params).id),input=Input.safeParse(await request.json().catch(()=>null));
 if(!Number.isSafeInteger(id)||id<1||!input.success)return Response.json({error:'Invalid action.'},{status:400});
 try{const result=input.data.action==='undo'?await undoExit(id,input.data.undo_token!):await transition(id,input.data.action);if('error'in result)return Response.json(result,{status:result.status});
  if(['call','notify','undo'].includes(input.data.action))after(async()=>{try{await publishPilotCalls();}catch{}});
  return Response.json(result);
 }catch{return pilotUnavailable();}
}

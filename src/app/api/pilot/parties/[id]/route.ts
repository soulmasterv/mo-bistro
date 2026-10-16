import { z } from 'zod';
import { after } from 'next/server';
import { transition } from '@/lib/pilot/store';
import { pilotStaff,pilotOrigin,pilotUnavailable } from '@/lib/pilot/http';
import { publishPilotCalls } from '@/lib/pilot/whatsapp';
const Input=z.object({action:z.enum(['call','seated','left'])}).strict();
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}) {
 const denied=await pilotStaff();if(denied)return denied;const origin=pilotOrigin(request);if(origin)return origin;
 const id=Number((await context.params).id),input=Input.safeParse(await request.json().catch(()=>null));
 if(!Number.isSafeInteger(id)||id<1||!input.success)return Response.json({error:'Invalid action.'},{status:400});
 try{const result=await transition(id,input.data.action);if('error'in result)return Response.json(result,{status:result.status});
  if(input.data.action==='call')after(async()=>{try{await publishPilotCalls();}catch{}});
  return Response.json(result);
 }catch{return pilotUnavailable();}
}

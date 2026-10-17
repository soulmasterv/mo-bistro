import { after } from 'next/server';
import { PartyInput,createParty,listQueue } from '@/lib/pilot/store';
import { pilotStaff,pilotOrigin,pilotUnavailable,privateHeaders } from '@/lib/pilot/http';
import { publishPilotCalls } from '@/lib/pilot/whatsapp';
import { timedPilotRoute } from '@/lib/pilot/timing';
export const maxDuration=30;
export async function GET(){
 return timedPilotRoute(async db=>{
 const denied=await db(()=>pilotStaff());if(denied)return denied;
 try{const parties=await db(()=>listQueue());after(async()=>{try{await publishPilotCalls();}catch{}});return Response.json(parties,{headers:privateHeaders});}catch{return pilotUnavailable();}
 });
}
export async function POST(request:Request){
 const denied=await pilotStaff();if(denied)return denied;const origin=pilotOrigin(request);if(origin)return origin;
 const parsed=PartyInput.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:'Check the booking details.'},{status:400});
 try{const party=await createParty({...parsed.data,whatsapp_consent:false},'walk_in');return party?Response.json(party,{status:201,headers:privateHeaders}):Response.json({error:'Phone already has an active party.'},{status:409});}catch{return pilotUnavailable();}
}

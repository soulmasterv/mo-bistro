import { checkRateLimit } from '@/lib/api-rate-limit';
import { validToken,partyStatus,enableReadyAlert,readyAlertLink } from '@/lib/pilot/store';
import { pilotUnavailable,privateHeaders,pilotOrigin } from '@/lib/pilot/http';
export async function GET(request:Request){
 const token=new URL(request.url).searchParams.get('token');
 if(!validToken(token))return Response.json({error:'Invalid private link.'},{status:400});
 try{const limited=await checkRateLimit(request,'pilot-status',90,60);if(limited)return limited;
  const party=await partyStatus(token);return party?Response.json({...party,whatsapp_url:party.whatsapp_consent?readyAlertLink(party.id):null},{headers:privateHeaders}):Response.json({error:'Booking not found.'},{status:404});
 }catch{return pilotUnavailable();}
}
export async function POST(request:Request){
 const origin=pilotOrigin(request);if(origin)return origin;
 const body=await request.json().catch(()=>null);
 if(!validToken(body?.token)||body?.consent!==true)return Response.json({error:'Please confirm your choice.'},{status:400});
 try{const limited=await checkRateLimit(request,'pilot-consent',10,60);if(limited)return limited;
  return await enableReadyAlert(body.token)?Response.json({success:true},{headers:privateHeaders}):Response.json({error:'This booking is no longer waiting.'},{status:409});
 }catch{return pilotUnavailable();}
}

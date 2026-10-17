import { checkRateLimit } from '@/lib/api-rate-limit';
import { PartyInput, createParty } from '@/lib/pilot/store';
import { pilotOrigin,pilotUnavailable,privateHeaders } from '@/lib/pilot/http';
export async function POST(request:Request) {
 const origin=pilotOrigin(request);if(origin)return origin;
 try {
  const limited=await checkRateLimit(request,'pilot-join',60,600);
  if(limited){if(limited.status===429)console.warn('pilot_join_throttled',{scope:'ip'});return limited;}
  const parsed=PartyInput.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:'Check your name, Egyptian mobile number, party size and seating preference.'},{status:400});
  const phoneLimit=await checkRateLimit(request,'pilot-join-phone',5,600,parsed.data.phone);
  if(phoneLimit){if(phoneLimit.status===429)console.warn('pilot_join_throttled',{scope:'phone'});return phoneLimit;}
  const party=await createParty(parsed.data,'qr');
  return party?Response.json(party,{status:201,headers:privateHeaders}):Response.json({error:'This phone already has a waiting party. Please speak with reception.'},{status:409});
 }catch{return pilotUnavailable();}
}

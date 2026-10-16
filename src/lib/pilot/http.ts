import 'server-only';
import { currentStaff } from '@/lib/staff-auth';
import { rejectCrossOrigin } from '@/lib/guest-api-security';
import { PILOT_STAFF_USERNAME } from './config';
export async function pilotStaff() {
 const staff=await currentStaff();
 return staff?.username.toLowerCase()===PILOT_STAFF_USERNAME?null:Response.json({error:'Sign in to Reception.'},{status:401});
}
export function pilotOrigin(request:Request) {
 return !request.headers.get('origin')?Response.json({error:'Invalid origin'},{status:403}):rejectCrossOrigin(request);
}
export function pilotUnavailable(){return Response.json({error:'Pilot setup is unavailable. Please speak with reception.'},{status:503});}
export const privateHeaders={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};

import {currentStaff} from '@/lib/staff-auth';
import {receptionSnapshot} from '@/lib/reception-snapshot';
import {after} from 'next/server';
import {advancedEnabled} from '@/lib/advanced/flags';
import {dispatchReminders} from '@/lib/advanced/reminders';
export const runtime='nodejs';
export async function GET(){
 const staff=await currentStaff();
 if(!staff||!['manager','reception'].includes(staff.role))return Response.json({error:'Forbidden'},{status:403});
 if(process.env.MO_BISTRO_DB!=='postgres')return Response.json({error:'PostgreSQL required'},{status:503});
 try{
  const snapshot=await receptionSnapshot();
  // Preserve the existing flag-gated outbox recovery after the response, outside the read transaction.
  if(advancedEnabled('reminders'))after(async()=>{try{await dispatchReminders();}catch{console.error('Advanced reminder dispatch deferred');}});
  return Response.json(snapshot,{headers:{'Cache-Control':'private, no-store'}});
 }
 catch{return Response.json({error:'Unable to refresh reception.'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
}

import {z} from 'zod';
import {advancedEnabled} from '@/lib/advanced/flags';
import {readWebhookBody} from '@/lib/whatsapp/http';
import {verifyQstash} from '@/lib/whatsapp/transport';
import {deliverReminder} from '@/lib/advanced/reminders';
export const runtime='nodejs';
const schema=z.object({reminderId:z.uuid()}).strict();
export async function POST(request:Request){
 if(!advancedEnabled('reminders'))return Response.json({error:'Disabled'},{status:404});
 let raw:string;
 try{raw=await readWebhookBody(request,4096);}catch{return Response.json({error:'Invalid body'},{status:413});}
 if(!await verifyQstash(raw,request.headers.get('upstash-signature'),'/api/advanced/reminders/jobs'))return Response.json({error:'Invalid signature'},{status:401});
 const parsed=schema.safeParse(await Promise.resolve().then(()=>JSON.parse(raw)).catch(()=>null));
 if(!parsed.success)return Response.json({error:'Invalid job'},{status:400});
 try{
  const result=await deliverReminder(parsed.data.reminderId);
  return Response.json({ok:true},{status:result==='retry'?503:200});
 }catch{return Response.json({error:'Delivery unavailable'},{status:503});}
}

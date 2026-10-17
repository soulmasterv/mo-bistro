import { z } from 'zod';
import { readWebhookBody } from '@/lib/whatsapp/http';
import { deliverPilotCall,verifyPilotJob } from '@/lib/pilot/whatsapp';
const Input=z.object({notificationId:z.uuid()}).strict();
export const maxDuration=30;
export async function POST(request:Request){
 let raw:string;try{raw=await readWebhookBody(request,4096);}catch{return Response.json({error:'Invalid body'},{status:413});}
 if(!await verifyPilotJob(raw,request.headers.get('upstash-signature')))return Response.json({error:'Invalid signature'},{status:401});
 const parsed=Input.safeParse(await Promise.resolve().then(()=>JSON.parse(raw)).catch(()=>null));
 if(!parsed.success)return Response.json({error:'Invalid job'},{status:400});
 try{await deliverPilotCall(parsed.data.notificationId);return Response.json({received:true});}catch{return Response.json({error:'Delivery unavailable'},{status:503});}
}

import 'server-only';
import {randomUUID} from 'node:crypto';
import type {TransactionSql} from 'postgres';
import {hashCode} from '@/lib/whatsapp/policy';
export function manualNearlyReadyKey(guestId:number){
 const digest=hashCode('advanced-manual-nearly-ready:'+guestId);
 return `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
}
// One manual nearly-ready request per booking; retries reuse its immutable job.
export async function queueManualNearlyReady(tx:TransactionSql,guestId:number,eta:Date,actorId:number,requestId:string){
 const [job]=await tx`INSERT INTO whatsapp_notifications(id,guest_id,kind,due_at,event_key,eta_snapshot_at)
  VALUES(${randomUUID()},${guestId},'almost_ready',NOW(),${manualNearlyReadyKey(guestId)},${eta})
  ON CONFLICT(event_key) WHERE event_key IS NOT NULL DO NOTHING RETURNING id`;
 if(job)await tx`INSERT INTO whatsapp_delivery_logs(notification_id,event_key,event)
  VALUES(${job.id},${'manual:'+requestId},${'manual_requested_by_staff:'+actorId}) ON CONFLICT(event_key) DO NOTHING`;
 return !!job;
}

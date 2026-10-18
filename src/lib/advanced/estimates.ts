import 'server-only';
import type {TransactionSql} from 'postgres';
import {advancedConfig,advancedEnabled} from '@/lib/advanced/flags';

export function estimateRange(samples:number[],minimum:number) {
  const valid=samples.filter(n=>Number.isFinite(n)&&n>=0).sort((a,b)=>a-b);
  if(valid.length<minimum)return null;
  const middle=Math.floor(valid.length/2);
  const median=valid.length%2?valid[middle]:(valid[middle-1]+valid[middle])/2;
  const low=Math.max(0,Math.floor((median-5)/5)*5),high=Math.max(5,Math.ceil((median+5)/5)*5);
  return {median,low,high,copy:`about ${low}-${high} min (an estimate)`};
}

export async function confirmationEstimate(tx:TransactionSql,notificationId:string,guestId:number) {
  if(!advancedEnabled('waitEstimate'))return null;
  const [existing]=await tx`SELECT estimate_copy FROM advanced_wait_estimates WHERE notification_id=${notificationId}`;
  if(existing)return existing.estimate_copy as string|null;
  const [guest]=await tx`SELECT party_size,seating_preference,status FROM guests WHERE id=${guestId}`;
  if(!guest)return null;
  const config=advancedConfig();
  const rows=guest.status==='waiting'?await tx<{minutes:number}[]>`
    SELECT EXTRACT(EPOCH FROM (seated_at-CASE WHEN pg_input_is_valid(created_at,'timestamp with time zone') THEN created_at::timestamptz END))/60 AS minutes
    FROM guests WHERE status='seated' AND seated_at IS NOT NULL
      AND party_size=${guest.party_size} AND seating_preference=${guest.seating_preference}
      AND seated_at>=CASE WHEN pg_input_is_valid(created_at,'timestamp with time zone') THEN created_at::timestamptz END
    ORDER BY seated_at DESC,id DESC LIMIT ${config.historyLimit}
  `:[];
  const range=estimateRange(rows.map(r=>Number(r.minutes)),config.minSamples);
  await tx`INSERT INTO advanced_wait_estimates(notification_id,guest_id,party_size,preference,sample_count,median_minutes,low_minutes,high_minutes,estimate_copy,reason)
    VALUES(${notificationId},${guestId},${guest.party_size},${guest.seating_preference},${rows.length},${range?.median??null},${range?.low??null},${range?.high??null},${range?.copy??null},${range?'estimated':guest.status!=='waiting'?'not_waiting':'insufficient_history'})
    ON CONFLICT(notification_id) DO NOTHING`;
  const [snapshot]=await tx`SELECT estimate_copy FROM advanced_wait_estimates WHERE notification_id=${notificationId}`;
  return snapshot?.estimate_copy as string|null;
}

export async function estimateAccepted(tx:TransactionSql,notificationId:string) {
  if(advancedEnabled('waitEstimate'))await tx`UPDATE advanced_wait_estimates SET accepted_at=COALESCE(accepted_at,NOW()) WHERE notification_id=${notificationId} AND estimate_copy IS NOT NULL`;
}

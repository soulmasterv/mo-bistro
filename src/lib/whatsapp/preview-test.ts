import "server-only";
import { randomUUID } from "node:crypto";
import { normalizePhone } from "@/lib/whatsapp/policy";
import { getPostgres } from "@/lib/postgres-db";
import { requestMetaTemplate } from "@/lib/whatsapp/transport";
export const TEST_TEXT = "Hello! 👋 This is a test message from Mo Bistro. Your WhatsApp integration is working successfully!";
export function previewTestEnabled() {
  return process.env.VERCEL_ENV === "preview" && process.env.WHATSAPP_PREVIEW_TEST_ENABLED === "true" &&
    process.env.WHATSAPP_MODE === "test" && process.env.MO_BISTRO_DB === "postgres" &&
    process.env.WHATSAPP_ALLOW_LIVE_SEND !== "true";
}
export function previewTestRecipient() {
  if (!previewTestEnabled() || !process.env.WHATSAPP_TEST_RECIPIENT) throw new Error("Test disabled");
  return normalizePhone(process.env.WHATSAPP_TEST_RECIPIENT);
}
function businessNumberId() {
  const value = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!value || !/^\d+$/.test(value)) throw new Error("Business number missing");
  return value;
}
export async function previewTestState() {
  const phone = previewTestRecipient(), business = businessNumberId();
  if (!business) throw new Error("Business number missing");
  const sql = getPostgres();
  const [window] = await sql`SELECT message_id FROM whatsapp_preview_inbound WHERE phone=${phone}
    AND phone_number_id=${business} AND provider_timestamp > NOW() - INTERVAL '24 hours'
    AND provider_timestamp <= NOW() ORDER BY provider_timestamp DESC LIMIT 1`;
  const [last] = await sql`SELECT id,state,provider_status,provider_message_id,delivery_status FROM whatsapp_preview_tests
    WHERE phone=${phone} AND phone_number_id=${business} ORDER BY created_at DESC LIMIT 1`;
  return {enabled:true, window_open:!!window, result:last ?? null};
}
export async function sendPreviewTest() {
  const phone = previewTestRecipient(), business = businessNumberId();
  const state = await previewTestState();
  if (!state.window_open) return {state:"failed" as const,error:"test_window_closed: Send a message to the Meta test number first. Verified inbound within 24 hours is required."};
  const sql = getPostgres(), id = randomUUID();
  // Claim before provider I/O. Failure or timeout is never automatically retried.
  await sql`INSERT INTO whatsapp_preview_tests (id,phone,phone_number_id,state) VALUES (${id},${phone},${business},'sending')`;
  const result = await requestMetaTemplate({messaging_product:"whatsapp",to:phone,type:"text",text:{body:TEST_TEXT},biz_opaque_callback_data:id});
  await sql`UPDATE whatsapp_preview_tests SET state=${result.state},provider_status=${result.providerStatus ?? null},
    provider_message_id=COALESCE(provider_message_id,${result.messageId ?? null}) WHERE id=${id}`;
  return {...result, attemptId:id};
}
// Called only after the existing Meta signature check and business-number validation.
export async function recordPreviewInbound(id:string, phone:string, timestamp:number) {
  if (!previewTestEnabled() || phone !== previewTestRecipient()) return false;
  if (timestamp*1000 > Date.now()) return true;
  const sql=getPostgres();
  await sql`INSERT INTO whatsapp_preview_inbound (message_id,phone,phone_number_id,provider_timestamp)
    VALUES (${id},${phone},${businessNumberId()},${new Date(timestamp*1000)})
    ON CONFLICT (message_id) DO NOTHING`;
  return true;
}
export async function recordPreviewDelivery(id:string, state:string, timestamp:number, opaque?:string) {
  if (!previewTestEnabled()) return false;
  const sql=getPostgres();
  const rows=await sql`UPDATE whatsapp_preview_tests SET provider_message_id=COALESCE(provider_message_id,${id}),
    delivery_status=${state},delivery_timestamp=${timestamp}
    WHERE phone=${previewTestRecipient()} AND phone_number_id=${businessNumberId()}
      AND (provider_message_id=${id} OR id::text=${opaque ?? ""})
      AND (delivery_timestamp IS NULL OR delivery_timestamp < ${timestamp}
        OR (delivery_timestamp=${timestamp} AND delivery_status='sent' AND ${state} IN ('delivered','read')))
    RETURNING id`;
  return rows.length > 0;
}

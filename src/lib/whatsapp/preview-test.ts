import "server-only";
import { normalizePhone } from "@/lib/whatsapp/policy";
import { requestMetaTemplate, templatePayload } from "@/lib/whatsapp/transport";

export function previewTestRecipient() {
  if (process.env.VERCEL_ENV !== "preview" ||
      process.env.WHATSAPP_PREVIEW_TEST_ENABLED !== "true" ||
      process.env.WHATSAPP_MODE !== "test" ||
      process.env.MO_BISTRO_DB !== "postgres" ||
      process.env.WHATSAPP_ALLOW_LIVE_SEND === "true") throw new Error("Test disabled");
  const recipient = process.env.WHATSAPP_TEST_RECIPIENT;
  if (!recipient) throw new Error("Test recipient missing");
  return normalizePhone(recipient);
}

export async function sendPreviewTest() {
  const recipient = previewTestRecipient();
  // Synthetic booking zero cannot subscribe a real booking. No SQL or outbox access.
  const payload = templatePayload({ id: "preview-manual-test", kind: "confirmation", guest_id: 0 },
    { phone: recipient, name: "Preview Test" }, "0".repeat(64));
  return requestMetaTemplate(payload);
}

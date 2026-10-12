import { currentStaff } from "@/lib/staff-auth";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { previewTestRecipient, previewTestState, sendPreviewTest } from "@/lib/whatsapp/preview-test";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
async function authorize() {
  const staff = await currentStaff();
  if (!staff) return Response.json({error: "Sign in required"}, {status:401, headers});
  if (staff.role !== "manager") return Response.json({error: "Manager access required"}, {status:403, headers});
  return null;
}
export async function GET() {
  const denied = await authorize(); if (denied) return denied;
  try { previewTestRecipient(); return Response.json(await previewTestState(), {headers}); }
  catch { return Response.json({enabled:false}, {headers}); }
}
export async function POST(request: Request) {
  const denied = await authorize(); if (denied) return denied;
  const origin = rejectCrossOrigin(request); if (origin) return origin;
  // Require browser same-origin evidence, even when Origin is absent.
  if (request.headers.get("sec-fetch-site") !== "same-origin")
    return Response.json({error:"Same-origin action required"}, {status:403, headers});
  const body = await request.json().catch(() => null);
  if (!body || Object.keys(body).length !== 1 || body.confirm !== true)
    return Response.json({error:"Explicit confirmation required; recipient overrides are forbidden"}, {status:400, headers});
  try { previewTestRecipient(); } catch {
    return Response.json({error:"Preview test is disabled or unconfigured"}, {status:503, headers});
  }
  try {
    const limited = await checkRateLimit(request, "whatsapp-preview-test", 1, 3600);
    if (limited) return limited;
  } catch { return Response.json({error:"Test rate limiter unavailable"}, {status:503, headers}); }
  try { return Response.json(await sendPreviewTest(), {headers}); }
  catch { return Response.json({error:"Test unavailable: verify Preview migration and provider configuration"}, {status:503, headers}); }
}

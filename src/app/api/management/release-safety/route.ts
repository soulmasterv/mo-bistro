import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/staff-session-shared";
import { approvedReleaseTarget, inspectReleaseSafety } from "@/lib/release-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const hidden = () => Response.json({ error: "Not found" }, { status: 404, headers });

export async function GET(request: Request) {
  // Next auto-implements HEAD via GET; never let it perform the diagnostic.
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { ...headers, Allow: "GET" } });
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
      (request.headers.has("origin") && request.headers.get("origin") !== new URL(request.url).origin)) return hidden();
  const target = approvedReleaseTarget(process.env);
  if (!target) return hidden(); // Before authentication SQL, including on Production.
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return hidden();
  try {
    const result = await inspectReleaseSafety(target, token, process.env);
    return result ? Response.json(result, { headers }) : hidden();
  } catch {
    // Never log or serialize a driver error: it may carry connection credentials.
    return Response.json({ error: "Diagnostic unavailable" }, { status: 503, headers });
  }
}

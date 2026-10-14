import { timingSafeEqual } from "node:crypto";
import { cleanupAvailable, runDatabaseCleanup } from "@/lib/database-cleanup";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
// Server-to-server scheduler only. No browser/manual purge action.
export async function POST(request: Request) {
  if (!cleanupAvailable()) return Response.json({ error: "Unavailable" }, { status: 403, headers });
  const secret = process.env.DATABASE_CLEANUP_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: "Scheduler not configured" }, { status: 503, headers });
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  try { return Response.json(await runDatabaseCleanup(), { headers }); }
  catch {
    console.error("database_cleanup_failed");
    return Response.json({ error: "Cleanup result unavailable; check the last run before retrying" }, { status: 503, headers });
  }
}

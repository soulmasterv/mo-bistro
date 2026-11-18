import { currentStaff } from "@/lib/staff-auth";
export const dynamic = "force-dynamic";
export async function GET() {
  const staff = await currentStaff();
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    "Vercel-CDN-Cache-Control": "no-store",
  };
  if (!staff || !["manager", "reception"].includes(staff.role))
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  return Response.json(
    {
      deployment:
        process.env.VERCEL_DEPLOYMENT_ID ||
        process.env.VERCEL_URL ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        "local",
    },
    { headers },
  );
}

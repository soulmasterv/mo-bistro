import { WorkflowError } from "@/lib/workflow-error";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentStaff } from "@/lib/staff-auth";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { getPostgres } from "@/lib/postgres-db";
import { listSimpleTables, freeSimpleTable } from "@/lib/simple-table-postgres";
import { databaseFailure, databaseErrorCode } from "@/lib/database-errors";
export const runtime = "nodejs";
const areaSchema = z.enum(["indoor", "outdoor"]);
function failure(error: unknown) {
  const code = databaseErrorCode(error);
  if (error instanceof WorkflowError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  console.error("Simple inventory failed:", code ?? "unavailable");
  const result = databaseFailure(
    error,
    "Unable to update anonymous table availability.",
    "migrations/20261012_simple_inventory.sql",
  );
  return NextResponse.json({ error: result.error }, { status: result.status });
}
export async function GET() {
  if (!(await currentStaff()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.MO_BISTRO_DB !== "postgres")
    return NextResponse.json(
      { error: "Anonymous inventory requires PostgreSQL." },
      { status: 503 },
    );
  try {
    const areas = await listSimpleTables();
    const [mode] =
      await getPostgres()`SELECT value FROM seating_settings WHERE key='table_view_mode'`;
    const named =
      mode?.value === "simple"
        ? await getPostgres()`SELECT id FROM restaurant_tables WHERE status='occupied' LIMIT 1`
        : [];
    return NextResponse.json(
      {
        areas,
        blocked_by_named_inventory: named.length > 0,
        warning: named.length
          ? "Named tables are still occupied. Switch to Detailed Mode and clear them before using anonymous inventory."
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  const staff = await currentStaff();
  if (!staff || !["manager", "reception"].includes(staff.role))
    return NextResponse.json(
      { error: "Reception access required." },
      { status: 403 },
    );
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (process.env.MO_BISTRO_DB !== "postgres")
    return NextResponse.json(
      { error: "PostgreSQL required." },
      { status: 503 },
    );
  const body = z
    .object({ area: areaSchema, operation_id: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "Invalid area or operation ID." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await freeSimpleTable(body.data.area, staff.id, body.data.operation_id),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: Request) {
  const staff = await currentStaff();
  if (staff?.role !== "manager")
    return NextResponse.json(
      { error: "Manager access required." },
      { status: 403 },
    );
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;
  if (process.env.MO_BISTRO_DB !== "postgres")
    return NextResponse.json(
      { error: "PostgreSQL required." },
      { status: 503 },
    );
  const body = z
    .object({
      area: areaSchema,
      total_tables: z.number().int().min(0).max(500),
      max_party_size: z.number().int().min(1).max(30),
    })
    .safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "Invalid area capacity." },
      { status: 400 },
    );
  try {
    const result = await getPostgres().begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(741122)`;
      const changed =
        await tx`UPDATE simple_table_capacity SET total_tables=${body.data.total_tables},max_party_size=${body.data.max_party_size}
        WHERE area=${body.data.area} AND occupied_tables <= ${body.data.total_tables} RETURNING area`;
      if (!changed.length)
        throw new WorkflowError(
          "Capacity cannot be smaller than the number of occupied tables.",
        );
      return { success: true };
    });
    return NextResponse.json(result);
  } catch (error) {
    return failure(error);
  }
}

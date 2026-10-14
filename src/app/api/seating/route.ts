import { WorkflowError } from "@/lib/workflow-error";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { getPostgres } from "@/lib/postgres-db";
import {
  listSimpleTables,
  assignSimpleTable,
} from "@/lib/simple-table-postgres";
import { databaseErrorCode, databaseFailure } from "@/lib/database-errors";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { NextResponse, after } from "next/server";
import { whatsappEnabled } from "@/lib/whatsapp/policy";
import { dispatchOutbox } from "@/lib/whatsapp/service";
import { currentStaff } from "@/lib/staff-auth";
import { getAssignableTables, assignTable } from "@/lib/seating-v3";
import {
  getAssignableTablesPostgres,
  assignTablePostgres,
} from "@/lib/seating-postgres";

export async function GET(request: Request) {
  const staff = await currentStaff();
  if (!staff)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["manager", "reception"].includes(staff.role)) {
    return NextResponse.json(
      { error: "Reception access required" },
      { status: 403 },
    );
  }

  const id = Number(new URL(request.url).searchParams.get("guest_id"));
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid guest" }, { status: 400 });
  }

  if (process.env.MO_BISTRO_DB === "postgres") {
    const sql = getPostgres();
    const [mode] =
      await sql`SELECT value FROM seating_settings WHERE key='table_view_mode'`;
    if (mode?.value === "simple") {
      try {
        const [guest] =
          await sql`SELECT id,party_size,seating_preference,status FROM guests WHERE id=${id}`;
        if (!guest)
          return NextResponse.json(
            { error: "Guest not found" },
            { status: 404 },
          );
        const [setting] =
          await sql`SELECT value FROM seating_settings WHERE key='allow_area_override'`;
        const areas = (await listSimpleTables()).filter(
          (area) =>
            area.free_tables > 0 &&
            area.max_party_size >= guest.party_size &&
            ((setting?.value ?? "true") === "true" ||
              guest.seating_preference === "any" ||
              guest.seating_preference === area.area),
        );
        return NextResponse.json({ guest, mode: "simple", areas });
      } catch (error) {
        const failure = databaseFailure(
          error,
          "Unable to load anonymous seating.",
          "migrations/20261012_simple_inventory.sql",
        );
        return NextResponse.json(
          { error: failure.error },
          { status: failure.status },
        );
      }
    }
  }
  const result =
    process.env.MO_BISTRO_DB === "postgres"
      ? await getAssignableTablesPostgres(id)
      : getAssignableTables(id);
  if (!result) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const staff = await currentStaff();
  if (!staff)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["manager", "reception"].includes(staff.role)) {
    return NextResponse.json(
      { error: "Reception access required" },
      { status: 403 },
    );
  }
  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;

  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  const body = await request.json().catch(() => null);
  const validArea =
    (body?.area === "indoor" || body?.area === "outdoor") &&
    body?.table_id === undefined;
  const validTable =
    Number.isSafeInteger(body?.table_id) &&
    body.table_id > 0 &&
    body?.area === undefined;
  if (
    !Number.isSafeInteger(body?.guest_id) ||
    body.guest_id < 1 ||
    !(validArea || validTable)
  ) {
    return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
  }
  try {
    const result =
      body.area && process.env.MO_BISTRO_DB === "postgres"
        ? await assignSimpleTable(body.guest_id, body.area, staff.id)
        : process.env.MO_BISTRO_DB === "postgres"
          ? await assignTablePostgres(body.guest_id, body.table_id, staff.id)
          : assignTable(body.guest_id, body.table_id);
    if (whatsappEnabled()) after(async () => {
      try { await dispatchOutbox(); } catch { console.error("WhatsApp outbox dispatch deferred"); }
    });
    return NextResponse.json(result);
  } catch (error) {
    if (databaseErrorCode(error)) {
      const failure = databaseFailure(
        error,
        "Unable to seat guest.",
        "migrations/20261012_simple_inventory.sql",
      );
      return NextResponse.json(
        { error: failure.error },
        { status: failure.status },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof WorkflowError
            ? error.message
            : "Unable to seat guest.",
      },
      { status: 409 },
    );
  }
}

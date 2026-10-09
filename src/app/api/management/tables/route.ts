import { getPostgres } from "@/lib/postgres-db";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { currentStaff } from "@/lib/staff-auth";
import { initializeTables, listTables } from "@/lib/restaurant-tables";

const schema = z.object({
  name: z.string().trim().min(1).max(40),
  seats: z.number().int().min(1).max(30),
  area: z.enum(["indoor", "outdoor"]),
});

export async function GET() {
  const staff = await currentStaff();

  if (staff?.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (process.env.MO_BISTRO_DB === "postgres") {
    const rows = await getPostgres()`SELECT id,name,seats,area,status,updated_at FROM restaurant_tables ORDER BY id`;
    return NextResponse.json(rows);
  }
  return NextResponse.json(listTables());
}

export async function POST(request: Request) {
  const badOrigin = rejectCrossOrigin(request);
  if (badOrigin) return badOrigin;

  const staff = await currentStaff();

  if (staff?.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;


  const parsed = schema.safeParse(
    await request.json().catch(() => null)
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid table details" },
      { status: 400 }
    );
  }

  if (process.env.MO_BISTRO_DB === "postgres") {
    try {
      const [row] = await getPostgres()`
        INSERT INTO restaurant_tables(name,seats,area)
        VALUES (${parsed.data.name},${parsed.data.seats},${parsed.data.area})
        RETURNING id
      `;
      return NextResponse.json({ id: row.id, success: true }, { status: 201 });
    } catch {
      return NextResponse.json({ error: "Table name already exists" }, { status: 409 });
    }
  }

  initializeTables();

  try {
    const result = db.prepare(`
      INSERT INTO restaurant_tables(name,seats,area)
      VALUES (?,?,?)
    `).run(parsed.data.name, parsed.data.seats, parsed.data.area);

    return NextResponse.json(
      { id: Number(result.lastInsertRowid), success: true },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Table name already exists" },
      { status: 409 }
    );
  }
}

export async function DELETE(request: Request) {
  const badOrigin = rejectCrossOrigin(request);
  if (badOrigin) return badOrigin;

  const staff = await currentStaff();

  if (staff?.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;


  const parsed = z.object({
    id: z.number().int().positive(),
  }).safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }

  if (process.env.MO_BISTRO_DB === "postgres") {
    const rows = await getPostgres()`
      DELETE FROM restaurant_tables
      WHERE id=${parsed.data.id} AND status='free'
      RETURNING id
    `;
    return rows.length
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: "Only existing free tables can be removed" }, { status: 409 });
  }

  initializeTables();

  const result = db.prepare(`
    DELETE FROM restaurant_tables
    WHERE id=? AND status='free'
  `).run(parsed.data.id);

  if (!result.changes) {
    return NextResponse.json(
      { error: "Only existing free tables can be removed" },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true });
}

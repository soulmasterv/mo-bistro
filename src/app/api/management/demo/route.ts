import { getPostgres } from "@/lib/postgres-db";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { currentStaff } from "@/lib/staff-auth";

export async function POST(request: Request) {
  const staff = await currentStaff();

  if (staff?.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;


  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (body?.action !== "generate") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const names = [
    "Demo Guest A","Demo Guest B","Demo Guest C",
    "Demo Guest D","Demo Guest E"
  ];

  if (process.env.MO_BISTRO_DB === "postgres") {
    const sql = getPostgres();
    await sql.begin(async (tx) => {
      for (const [i, name] of names.entries()) {
        await tx`
          INSERT INTO guests(name,phone,party_size,status,confirmed,source,seating_preference)
          VALUES (${name},'01000000000',${(i % 5) + 1},'waiting',0,'staff',${i % 2 === 0 ? "indoor" : "outdoor"})
        `;
      }
    });
    return NextResponse.json({ success: true, created: names.length });
  }

  const insert = db.prepare(`
    INSERT INTO guests(name,phone,party_size,status,confirmed,source,seating_preference)
    VALUES (?, ?, ?, 'waiting', 0, 'staff', ?)
  `);

  db.transaction(() => {
    names.forEach((name, i) => {
      insert.run(name, "01000000000", (i % 5) + 1,
        i % 2 === 0 ? "indoor" : "outdoor");
    });
  })();

  return NextResponse.json({ success: true, created: names.length });
}

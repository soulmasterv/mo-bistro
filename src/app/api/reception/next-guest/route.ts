import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { getPostgres } from "@/lib/postgres-db";


export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await currentStaff();
  if (!staff || !["manager", "reception"].includes(staff.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (process.env.MO_BISTRO_DB !== "postgres") {
    return NextResponse.json({ error: "PostgreSQL required" }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const area = params.get("area");
  if (area !== null) {
    if (!["indoor","outdoor"].includes(area)) return NextResponse.json({error:"Invalid area"},{status:400});
    try {
      const sql=getPostgres();
      const settings=await sql`SELECT key,value FROM seating_settings WHERE key IN ('table_view_mode','allow_area_override')`;
      const simple=settings.some(row=>row.key==='table_view_mode' && row.value==='simple');
      const override=(settings.find(row=>row.key==='allow_area_override')?.value ?? 'true')==='true';
      let seats=0;
      if(simple) {
        const named=await sql`SELECT id FROM restaurant_tables WHERE status='occupied' LIMIT 1`;
        if(named.length) return NextResponse.json({area,available:false,guest:null},{headers:{"Cache-Control":"no-store"}});
        const [pool]=await sql`SELECT max_party_size FROM simple_table_capacity WHERE area=${area} AND total_tables>occupied_tables`;
        seats=Number(pool?.max_party_size ?? 0);
      } else {
        const [table]=await sql`SELECT MAX(seats) AS seats FROM restaurant_tables WHERE area=${area} AND status='free'`;
        seats=Number(table?.seats ?? 0);
      }
      const guests=seats>0 ? await sql`SELECT id,name,party_size,seating_preference FROM guests
        WHERE status IN ('waiting','called') AND party_size<=${seats}
        AND (${override} OR seating_preference='any' OR seating_preference=${area})
        ORDER BY created_at ASC,id ASC LIMIT 1` : [];
      return NextResponse.json({area,available:seats>0,guest:guests[0]??null},{headers:{"Cache-Control":"no-store"}});
    } catch { return NextResponse.json({error:"Unable to find next guest"},{status:503}); }
  }
  const id = Number(params.get("table_id"));
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }

  try {
    const sql = getPostgres();
    const [table] = await sql`
      SELECT id, name, seats, area, status
      FROM restaurant_tables WHERE id = ${id}
    `;
    if (!table || table.status !== "free") {
      return NextResponse.json({ error: "Table is not available" }, { status: 409 });
    }

    const [setting] = await sql`SELECT value FROM seating_settings WHERE key = 'allow_area_override'`;
    const override = (setting?.value ?? "true") === "true";
    const guests = await sql`
      SELECT id, name, party_size, seating_preference
      FROM guests
      WHERE status IN ('waiting', 'called')
        AND party_size <= ${table.seats}
        AND (${override} OR seating_preference = 'any' OR seating_preference = ${table.area})
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `;

    return NextResponse.json({
      table: { id: table.id, name: table.name },
      guest: guests[0] ?? null
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to find next guest" }, { status: 503 });
  }
}

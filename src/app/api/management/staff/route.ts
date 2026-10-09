import { getPostgres } from "@/lib/postgres-db";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import {
  currentStaff,
  hashCredential,
  initStaff,
} from "@/lib/staff-auth";

const createSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_.-]{3,32}$/),
  role: z.enum(["manager", "reception"]),
  credential: z.string().min(4).max(256),
});

export async function POST(request: Request) {
  const badOrigin = rejectCrossOrigin(request);
  if (badOrigin) return badOrigin;

  const actor = await currentStaff();

  if (actor?.role !== "manager") {
    return NextResponse.json(
      { error: "Manager access required" },
      { status: 403 }
    );
  }
  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;


  const parsed = createSchema.safeParse(
    await request.json().catch(() => null)
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid account details" },
      { status: 400 }
    );
  }

  if (process.env.MO_BISTRO_DB !== "postgres") initStaff();

  const { username, role, credential } = parsed.data;

  if (process.env.MO_BISTRO_DB === "postgres") {
    try {
      const [row] = await getPostgres()`
        INSERT INTO staff_users(username,role,credential_hash)
        VALUES (${username},${role},${hashCredential(credential)})
        RETURNING id
      `;
      return NextResponse.json({ id: row.id, username, role }, { status: 201 });
    } catch {
      return NextResponse.json({ error: "Username already exists or could not be created" }, { status: 409 });
    }
  }

  try {
    const result = db.prepare(`
      INSERT INTO staff_users(username,role,credential_hash)
      VALUES (?,?,?)
    `).run(username, role, hashCredential(credential));

    return NextResponse.json(
      { id: Number(result.lastInsertRowid), username, role },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Username already exists or could not be created" },
      { status: 409 }
    );
  }
}

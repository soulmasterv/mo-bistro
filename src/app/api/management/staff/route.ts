import { databaseErrorCode, databaseFailure } from "@/lib/database-errors";
import { getPostgres } from "@/lib/postgres-db";
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
  role: z.enum(["manager", "reception", "waiter"]),
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


  const parsed = createSchema.safeParse(
    await request.json().catch(() => null)
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid username (3–32 letters, numbers, underscores, dots or hyphens), role and password (at least 4 characters)." },
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
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        return NextResponse.json({ error: "Username already exists." }, { status: 409 });
      }
      console.error("Staff creation failed:", databaseErrorCode(error) ?? "unavailable");
      const failure = databaseFailure(error, "Unable to create staff account.", "migrations/20261010_staff_pin_login.sql");
      return NextResponse.json({ error: failure.error }, { status: failure.status });
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


export async function PATCH(request: Request) {
  const staff = await currentStaff();
  if (!staff || staff.role !== "manager") {
    return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  }

  const originError = rejectCrossOrigin(request);
  if (originError) return originError;


  if (process.env.MO_BISTRO_DB !== "postgres") {
    return NextResponse.json({ error: "PostgreSQL required." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const id = body?.staff_id;
  const active = body?.active;

  if (!Number.isSafeInteger(id) || id < 1 || (active !== 0 && active !== 1)) {
    return NextResponse.json({ error: "Invalid staff ID or status." }, { status: 400 });
  }

  if (id === staff.id && active === 0) {
    return NextResponse.json(
      { error: "You cannot disable your own account." },
      { status: 400 }
    );
  }

  try {
    const sql = getPostgres();

    const result = await sql.begin(async tx => {
      // Serialize staff activation changes to prevent concurrent manager lockout.
      await tx`SELECT pg_advisory_xact_lock(86420931)`;

      const target = await tx<{ id: number; role: string; active: number }[]>`
        SELECT id, role, active
        FROM staff_users
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (!target.length) return "not_found";

      if (active === 0 && target[0].role === "manager" && target[0].active === 1) {
        const managers = await tx<{ count: number }[]>`
          SELECT COUNT(*)::integer AS count
          FROM staff_users
          WHERE role = 'manager' AND active = 1
        `;

        if (managers[0].count <= 1) return "last_manager";
      }

      await tx`
        UPDATE staff_users
        SET active = ${active}
        WHERE id = ${id}
      `;

      if (active === 0) {
        await tx`DELETE FROM staff_sessions WHERE staff_id = ${id}`;
      }

      return "updated";
    });

    if (result === "not_found") {
      return NextResponse.json({ error: "Staff account not found." }, { status: 404 });
    }

    if (result === "last_manager") {
      return NextResponse.json(
        { error: "Cannot disable the last active Manager." },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Staff activation update failed:", error);
    return NextResponse.json(
      { error: "Unable to update staff account." },
      { status: 500 }
    );
  }
}

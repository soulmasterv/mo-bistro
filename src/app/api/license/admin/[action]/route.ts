import { NextResponse } from "next/server";
import {
  authorizedOwner,
  licenseAdminDb,
} from "@/lib/licensing/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ action: string }>;
};

function reply(data: object, status: number) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request, context: Context) {
  if (!authorizedOwner(request)) {
    return reply({ error: "Unauthorized" }, 401);
  }

  if (request.headers.has("origin")) {
    return reply({ error: "Browser requests not accepted" }, 403);
  }

  const { action } = await context.params;

  if (!["activate", "renew", "suspend"].includes(action)) {
    return reply({ error: "Unknown action" }, 404);
  }

  try {
    const sql = licenseAdminDb();

    const result = await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(741109)`;

      const previous = await tx`
        SELECT status, expires_at
        FROM restaurant_license
        WHERE id = 1
        FOR UPDATE
      `;

      if (action === "activate" && previous.length) {
        return { error: "Already activated" };
      }

      if (action !== "activate" && !previous.length) {
        return { error: "License not configured" };
      }

      const before = previous[0];

      if (action === "activate") {
        await tx`
          INSERT INTO restaurant_license
            (id, status, plan, expires_at)
          VALUES
            (1, 'active', 'monthly', NOW() + INTERVAL '1 month')
        `;
      } else if (action === "renew") {
        await tx`
          UPDATE restaurant_license
          SET status = 'active',
              expires_at =
                GREATEST(expires_at, NOW()) + INTERVAL '1 month',
              updated_at = NOW()
          WHERE id = 1
        `;
      } else {
        await tx`
          UPDATE restaurant_license
          SET status = 'suspended',
              updated_at = NOW()
          WHERE id = 1
        `;
      }

      const after = await tx`
        SELECT status, expires_at
        FROM restaurant_license
        WHERE id = 1
      `;

      await tx`
        INSERT INTO license_audit_log
          (action, previous_status, new_status,
           previous_expiry, new_expiry)
        VALUES (
          ${action},
          ${before?.status ?? null},
          ${after[0].status},
          ${before?.expires_at ?? null},
          ${after[0].expires_at}
        )
      `;

      return {
        success: true,
        action,
        status: after[0].status,
        expires_at: after[0].expires_at,
      };
    });

    return "error" in result
      ? reply(result, 409)
      : reply(result, 200);
  } catch {
    return reply({ error: "License operation failed" }, 503);
  }
}

export async function GET(request: Request, context: Context) {
  if (!authorizedOwner(request)) {
    return reply({ error: "Unauthorized" }, 401);
  }

  const { action } = await context.params;

  if (action !== "audit") {
    return reply({ error: "Not found" }, 404);
  }

  try {
    const sql = licenseAdminDb();

    const entries = await sql`
      SELECT *
      FROM license_audit_log
      ORDER BY id DESC
      LIMIT 100
    `;

    return reply({ entries }, 200);
  } catch {
    return reply({ error: "Audit unavailable" }, 503);
  }
}

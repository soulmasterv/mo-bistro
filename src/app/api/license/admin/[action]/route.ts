import { NextResponse } from "next/server";
import {
  authorizedOwner,
  licenseAdminDb,
  licenseDb,
  licenseStatus,
  licenseTargetsMatch,
  licenseVersion,
} from "@/lib/licensing/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ action: string }>;
};

function reply(data: object, status: number, etag?: string) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...(etag ? {ETag:etag} : {}) },
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

  if (!["activate", "renew", "suspend", "suspend-notice"].includes(action)) {
    return reply({ error: "Unknown action" }, 404);
  }
  const version = request.headers.get("if-match");
  if (!version || !/^"license-[a-f0-9]{64}"$/.test(version))
    return reply({ error: "Read the current license setup and confirm its version before changing it" }, 428);

  try {
    const sql = licenseAdminDb();

    const result = await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(741109)`;
      const [schema] = await tx`SELECT
        (SELECT COUNT(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name='restaurant_license'
          AND column_name IN ('suspension_due_at','license_revision')) AND
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='license_audit_log'
          AND column_name='details') AS grace_schema`;
      if (action === "suspend-notice" && !schema?.grace_schema)
        return { error: "24-hour notices require the reviewed license grace migration" };

      const previous = await tx`
        SELECT status, plan, expires_at, expires_at > NOW() AS not_expired,
          to_jsonb(l)->>'suspension_due_at' AS suspension_due_at,
          to_jsonb(l)->>'license_revision' AS license_revision
        FROM public.restaurant_license l
        WHERE id = 1
        FOR UPDATE
      `;
      if (licenseVersion(previous[0]) !== version) return { error: "License changed; refresh and confirm again", stale:true };

      if (action === "activate" && previous.length && previous[0].status !== "suspended" && !previous[0].suspension_due_at) {
        return { error: "Already activated" };
      }
      if (action === "activate" && previous.length && !previous[0].not_expired) return { error:"Expired license must be renewed" };

      if (action !== "activate" && !previous.length) {
        return { error: "License not configured" };
      }

      const before = previous[0];
      if (action === "suspend-notice" && (before.status !== "active" || !before.not_expired || before.suspension_due_at))
        return { error:"A notice can only start on an active license without an existing suspension deadline" };
      if (action === "suspend" && before.status === "suspended") return { error:"Already suspended" };

      if (action === "suspend-notice") {
        await tx`UPDATE public.restaurant_license SET suspension_due_at=NOW()+INTERVAL '24 hours',
          license_revision=license_revision+1,updated_at=NOW() WHERE id=1`;
      } else if (action === "activate" && before) {
        // Reactivation removes suspension only; it never purchases/adds another month.
        if (schema?.grace_schema) await tx`UPDATE public.restaurant_license SET status='active',suspension_due_at=NULL,
          license_revision=license_revision+1,updated_at=NOW() WHERE id=1`;
        else await tx`UPDATE public.restaurant_license SET status='active',updated_at=NOW() WHERE id=1`;
      } else if (action === "activate") {
        await tx`
          INSERT INTO public.restaurant_license
            (id, status, plan, expires_at)
          VALUES
            (1, 'active', 'monthly', NOW() + INTERVAL '1 month')
        `;
      } else if (action === "renew") {
        await tx`
          UPDATE public.restaurant_license
          SET status = 'active',
              expires_at =
                GREATEST(expires_at, NOW()) + INTERVAL '1 month',
              updated_at = NOW()
          WHERE id = 1
        `;
        if (schema?.grace_schema) await tx`UPDATE public.restaurant_license SET suspension_due_at=NULL,
          license_revision=license_revision+1 WHERE id=1`;
      } else {
        await tx`
          UPDATE public.restaurant_license
          SET status = 'suspended',
              updated_at = NOW()
          WHERE id = 1
        `;
        if (schema?.grace_schema) await tx`UPDATE public.restaurant_license SET suspension_due_at=NULL,
          license_revision=license_revision+1 WHERE id=1`;
      }

      const after = await tx`
        SELECT status, plan, expires_at,
          to_jsonb(l)->>'suspension_due_at' AS suspension_due_at,
          to_jsonb(l)->>'license_revision' AS license_revision
        FROM public.restaurant_license l
        WHERE id = 1
      `;

      const auditAction = action === "suspend-notice" ? "suspend" : action;
      if (schema?.grace_schema) await tx`INSERT INTO public.license_audit_log
        (action,previous_status,new_status,previous_expiry,new_expiry,details)
        VALUES (${auditAction},${before?.status ?? null},${after[0].status},${before?.expires_at ?? null},${after[0].expires_at},
          ${JSON.stringify({mode:action === "suspend-notice" ? "grace" : action === "suspend" ? "immediate" : action,
            suspension_due_at:after[0].suspension_due_at})}::jsonb)`;
      else await tx`
        INSERT INTO public.license_audit_log
          (action, previous_status, new_status,
           previous_expiry, new_expiry)
        VALUES (
          ${auditAction},
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
        suspension_due_at: after[0].suspension_due_at,
        version: licenseVersion(after[0]),
      };
    });

    return "error" in result
      ? reply({error:result.error}, "stale" in result ? 412 : 409)
      : reply(result, 200, result.version);
  } catch {
    return reply({ error: "License operation failed" }, 503);
  }
}

export async function GET(request: Request, context: Context) {
  if (!authorizedOwner(request)) {
    return reply({ error: "Unauthorized" }, 401);
  }

  const { action } = await context.params;

  if (action === "setup") {
    if (!licenseTargetsMatch()) return reply({ready:false,problem:"database_target_mismatch_or_missing_configuration"},200);
    try {
      const read = licenseDb(), write = licenseAdminDb();
      const [reader] = await read`SELECT to_regclass('public.restaurant_license') IS NOT NULL AS license_table`;
      const [writer] = await write`SELECT to_regclass('public.restaurant_license') IS NOT NULL AS license_table,
        to_regclass('public.license_audit_log') IS NOT NULL AS audit_table,
        CASE WHEN to_regclass('public.restaurant_license') IS NULL THEN FALSE ELSE
          has_table_privilege(current_user,'public.restaurant_license','SELECT') AND
          has_table_privilege(current_user,'public.restaurant_license','INSERT') AND
          has_table_privilege(current_user,'public.restaurant_license','UPDATE') END AS can_change_license,
        CASE WHEN to_regclass('public.license_audit_log') IS NULL THEN FALSE ELSE
          has_table_privilege(current_user,'public.license_audit_log','SELECT') AND
          has_table_privilege(current_user,'public.license_audit_log','INSERT') AND
          has_sequence_privilege(current_user,pg_get_serial_sequence('public.license_audit_log','id'),'USAGE') END AS can_write_audit`;
      const license = reader?.license_table ? await licenseStatus() : null;
      const [grace] = await write`SELECT
        (SELECT COUNT(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name='restaurant_license'
          AND column_name IN ('suspension_due_at','license_revision')) AND
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='license_audit_log'
          AND column_name='details') AS available`;
      return reply({ ready:!!(reader?.license_table && writer?.license_table && writer?.audit_table && writer?.can_change_license && writer?.can_write_audit),
        databaseTargetMatches:true, readerReady:!!reader?.license_table,
        writerReady:!!(writer?.license_table && writer?.audit_table && writer?.can_change_license && writer?.can_write_audit),
        graceReady:!!grace?.available, license, version:license ? licenseVersion(license) : null },200,license ? licenseVersion(license) : undefined);
    } catch { return reply({ready:false,problem:"license_database_or_schema_unavailable"},503); }
  }

  if (action !== "audit") {
    return reply({ error: "Not found" }, 404);
  }

  try {
    const sql = licenseAdminDb();

    const entries = await sql`
      SELECT *
      FROM public.license_audit_log
      ORDER BY id DESC
      LIMIT 100
    `;

    return reply({ entries }, 200);
  } catch {
    return reply({ error: "Audit unavailable" }, 503);
  }
}

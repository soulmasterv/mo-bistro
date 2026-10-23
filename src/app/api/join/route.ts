import { createBookingPostgres } from "@/lib/booking-creation";
import { confirmationRequired } from "@/lib/confirmation-policy";
import { isAllowedQROrigin } from "@/lib/qr-origin";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { getSettingPostgres } from "@/lib/staff-auth-postgres";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { getSetting } from "@/lib/staff-auth";
import { verifyQR } from "@/lib/rotating-qr";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { NextResponse, after } from "next/server";
import { dispatchOutbox } from "@/lib/whatsapp/service";
import { whatsappEnabled } from "@/lib/whatsapp/policy";
import { z } from "zod";
import db from "@/lib/db";
import {
  initializeTracking,
  newTrackingToken,
  hashTrackingToken,
} from "@/lib/guest-tracking";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .refine((value) => {
      const parts = value.split(/\s+/);
      return (
        parts.length >= 2 &&
        parts.every(
          (part) =>
            /^[\p{L}\p{M}][\p{L}\p{M}'’-]*$/u.test(part) &&
            [...part].filter((char) => /\p{L}/u.test(char)).length >= 2,
        )
      );
    }, "Please enter your first and last name."),
  phone: z
    .string()
    .trim()
    .regex(
      /^01[0125][0-9]{8}$/,
      "Enter a valid 11-digit Egyptian mobile number.",
    ),
  party_size: z.number().int().min(1).max(30),
  seating_preference: z.enum(["indoor", "outdoor", "any"]).default("any"),
  qr_code: z.string().optional(),
  whatsapp_confirmation_consent: z.boolean().default(false),
  whatsapp_feedback_consent: z.boolean().default(false),
});

export async function POST(request: Request) {
  if (!isAllowedQROrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  const limited = await checkRateLimit(request, "join", 20, 600);
  if (limited) return limited;

  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;

  try {
    const body = schema.safeParse(await request.json());

    if (!body.success) {
      return NextResponse.json(
        { error: body.error.issues.find(issue => issue.path[0] === "phone")?.message
            || body.error.issues.find(issue => issue.path[0] === "name")?.message
            || "Please check your registration details." },
        { status: 400 },
      );
    }

    const setting = async (key: string, fallback: string) =>
      process.env.MO_BISTRO_DB === "postgres"
        ? getSettingPostgres(key, fallback)
        : getSetting(key, fallback);

    const qrRequired = (await setting("qr_required", "false")) === "true";
    const postgresMode = process.env.MO_BISTRO_DB === "postgres";

    // PostgreSQL registrations use a server-issued permit.
    // SQLite retains its existing QR verification behavior.
    if (qrRequired && !postgresMode && !(await verifyQR(body.data.qr_code))) {
      return NextResponse.json(
        {
          error:
            "This QR code has expired. Please scan the current code at reception.",
        },
        { status: 403 },
      );
    }

    if (process.env.MO_BISTRO_DB !== "postgres") initializeTracking();

    const { name, phone, party_size, seating_preference } = body.data;

    const capacity = Number(await setting("queue_capacity", "50"));
    if (process.env.MO_BISTRO_DB === "postgres") {
      const permitToken = qrRequired
        ? (await cookies()).get("mo_bistro_qr_permit")?.value
        : undefined;

      const permitHash =
        permitToken && /^[a-f0-9]{64}$/.test(permitToken)
          ? createHash("sha256").update(permitToken).digest("hex")
          : null;

      const qrCodeHash = body.data.qr_code
        ? createHash("sha256").update(body.data.qr_code).digest("hex")
        : null;

      if (qrRequired && !permitHash) {
        return NextResponse.json(
          {
            error:
              "Your QR registration has expired. Please scan the current QR code.",
          },
          { status: 403 },
        );
      }

      const result = await createBookingPostgres(
        { name, phone, party_size, seating_preference },
        {
          source: "qr",
          consent: body.data,
          permit: qrRequired
            ? { tokenHash: permitHash!, codeHash: qrCodeHash }
            : undefined,
        },
      );
      if ("error" in result)
        return NextResponse.json(
          {
            error:
              result.error === "paused"
                ? "The waitlist is temporarily closed. Please speak with reception."
                : result.error === "full"
                ? "The waitlist is currently full."
                : result.error === "expired"
                  ? "Your QR registration has expired. Please scan the current QR code."
                  : "This phone number already has an active registration. Please ask reception for assistance.",
          },
          { status: result.error === "expired" ? 403 : result.error === "paused" ? 503 : 409 },
        );
      if (whatsappEnabled())
        after(async () => {
          try {
            await dispatchOutbox();
          } catch {
            console.error("WhatsApp outbox dispatch deferred");
          }
        });
      return NextResponse.json(
        { success: true, id: result.id, token: result.token },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    }
    const token = newTrackingToken();
    const tokenHash = hashTrackingToken(token);

    const approvalRequired = await confirmationRequired();
    const createGuest = db.transaction(() => {
      if (getSetting("public_waitlist_paused", "false") === "true") return "paused" as const;
      const active = db
        .prepare(
          "SELECT COUNT(*) AS count FROM guests WHERE status IN ('waiting','called')",
        )
        .get() as { count: number };
      if (active.count >= capacity) return "full" as const;
      const duplicate = db
        .prepare(
          `
        SELECT id FROM guests
        WHERE phone = ?
        AND status IN ('waiting', 'called')
        LIMIT 1
      `,
        )
        .get(phone);

      if (duplicate) return null;

      const result = db
        .prepare(
          `
        INSERT INTO guests (
          name, phone, party_size, status,
          confirmed, source, tracking_token_hash, seating_preference
        )
        VALUES (?, ?, ?, 'waiting', ?, 'qr', ?, ?)
      `,
        )
        .run(
          name,
          phone,
          party_size,
          approvalRequired ? 0 : 1,
          tokenHash,
          seating_preference,
        );

      return result.lastInsertRowid;
    });

    const id = createGuest();
    if (id === "paused") return NextResponse.json(
      { error: "The waitlist is temporarily closed. Please speak with reception." }, { status: 503 });

    if (id === "full")
      return NextResponse.json(
        { error: "The waitlist is currently full." },
        { status: 409 },
      );
    if (id === null) {
      return NextResponse.json(
        {
          error:
            "This phone number already has an active registration. Please ask reception for assistance.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        id: Number(id),
        token,
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Guest registration error:", error);

    return NextResponse.json(
      { error: "Unable to join the waitlist right now." },
      { status: 500 },
    );
  }
}

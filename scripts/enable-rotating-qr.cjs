const fs = require("fs");

const api = "src/app/api/join/route.ts";
let source = fs.readFileSync(api, "utf8");

source =
  `import { getSetting } from "@/lib/staff-auth";
import { verifyQR } from "@/lib/rotating-qr";
` + source;

source = source.replace(
  "  party_size: z.number().int().min(1).max(30),",
  `  party_size: z.number().int().min(1).max(30),
  qr_code: z.string().optional(),`
);

source = source.replace(
  "    initializeTracking();",
  `    if (
      getSetting("qr_required", "false") === "true" &&
      !verifyQR(body.data.qr_code)
    ) {
      return NextResponse.json(
        { error: "This QR code has expired. Please scan the current code at reception." },
        { status: 403 }
      );
    }

    initializeTracking();`
);

source = source.replace(
  "    const { name, phone, party_size } = body.data;",
  `    const { name, phone, party_size } = body.data;

    const capacity = Number(getSetting("queue_capacity", "50"));
    const activeCount = (
      db.prepare("SELECT COUNT(*) AS count FROM guests WHERE status IN ('waiting','called')")
        .get()
    ).count;

    if (activeCount >= capacity) {
      return NextResponse.json(
        { error: "The waitlist is currently full." },
        { status: 409 }
      );
    }`
);

source = source.replace(
  "VALUES (?, ?, ?, 'waiting', 0, 'qr', ?)",
  `VALUES (?, ?, ?, 'waiting', ?, 'qr', ?)`
);

source = source.replace(
  ").run(name, phone, party_size, tokenHash);",
  `).run(
        name,
        phone,
        party_size,
        getSetting("approval_required", "true") === "true" ? 0 : 1,
        tokenHash
      );`
);

fs.writeFileSync(api, source);

const join = "src/app/join/page.tsx";
source = fs.readFileSync(join, "utf8");

source = source.replace(
  "          party_size: partySize,",
  `          party_size: partySize,
          qr_code: new URLSearchParams(window.location.search).get("code") || undefined,`
);

fs.writeFileSync(join, source);

console.log("QR validation and guest settings integrated.");

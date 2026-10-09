from pathlib import Path
import shutil
import sqlite3
import time

root = Path.cwd()
dbpath = root / "data/waitlist.sqlite"
backup = root / f"data/waitlist-before-seating-v3-{int(time.time())}.sqlite"

with sqlite3.connect(dbpath) as src, sqlite3.connect(backup) as dst:
    src.backup(dst)
print("Database backup:", backup)

def write(path, content):
    p = root / path
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists():
        shutil.copy2(p, p.with_name(p.name + ".before-seating-v3"))
    p.write_text(content)
    print("Wrote:", path)

with sqlite3.connect(dbpath) as db:
    guestcols = {r[1] for r in db.execute("PRAGMA table_info(guests)")}
    tablecols = {r[1] for r in db.execute("PRAGMA table_info(restaurant_tables)")}

    if "table_id" not in guestcols:
        db.execute("ALTER TABLE guests ADD COLUMN table_id INTEGER")
    if "seating_preference" not in guestcols:
        db.execute("ALTER TABLE guests ADD COLUMN seating_preference TEXT NOT NULL DEFAULT 'any'")
    if "area" not in tablecols:
        db.execute("ALTER TABLE restaurant_tables ADD COLUMN area TEXT NOT NULL DEFAULT 'indoor'")

    db.executescript("""
    CREATE TABLE IF NOT EXISTS seating_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id INTEGER NOT NULL,
      table_id INTEGER NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      released_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS one_active_guest_per_table
      ON guests(table_id)
      WHERE table_id IS NOT NULL AND status='seated';

    CREATE TABLE IF NOT EXISTS seating_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO seating_settings(key,value)
      VALUES ('require_table_assignment','true');

    INSERT OR IGNORE INTO seating_settings(key,value)
      VALUES ('allow_area_override','true');
    """)

write("src/lib/seating-v3.ts", r'''
import "server-only";
import db from "@/lib/db";

export function setupSeating() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS seating_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id INTEGER NOT NULL,
      table_id INTEGER NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      released_at TEXT
    );
    CREATE TABLE IF NOT EXISTS seating_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT OR IGNORE INTO seating_settings(key,value)
      VALUES ('require_table_assignment','true');
    INSERT OR IGNORE INTO seating_settings(key,value)
      VALUES ('allow_area_override','true');
  `);
}

export function getSetting(key: string) {
  setupSeating();
  const row = db.prepare(
    "SELECT value FROM seating_settings WHERE key=?"
  ).get(key) as { value: string } | undefined;
  return row?.value === "true";
}

export function getAssignableTables(guestId: number) {
  setupSeating();

  const guest = db.prepare(`
    SELECT id,party_size,seating_preference
    FROM guests WHERE id=?
  `).get(guestId) as {
    id: number;
    party_size: number;
    seating_preference: string;
  } | undefined;

  if (!guest) return null;

  const allowOverride = getSetting("allow_area_override");

  const tables = db.prepare(`
    SELECT t.id,t.name,t.seats,t.area,t.status
    FROM restaurant_tables t
    WHERE t.status='free'
      AND t.seats >= ?
      AND NOT EXISTS (
        SELECT 1 FROM guests g
        WHERE g.table_id=t.id AND g.status='seated'
      )
    ORDER BY
      CASE WHEN ?='any' OR t.area=? THEN 0 ELSE 1 END,
      t.seats ASC,
      t.id ASC
  `).all(
    guest.party_size,
    guest.seating_preference,
    guest.seating_preference
  ) as Array<{
    id: number;
    name: string;
    seats: number;
    area: string;
    status: string;
  }>;

  return {
    guest,
    tables: tables.filter(t =>
      allowOverride ||
      guest.seating_preference === "any" ||
      t.area === guest.seating_preference
    )
  };
}

export function assignTable(guestId: number, tableId: number) {
  setupSeating();

  const transaction = db.transaction(() => {
    const guest = db.prepare(`
      SELECT id,status,party_size,seating_preference,table_id
      FROM guests WHERE id=?
    `).get(guestId) as {
      id: number;
      status: string;
      party_size: number;
      seating_preference: string;
      table_id: number | null;
    } | undefined;

    if (!guest) throw new Error("Guest not found");
    if (guest.status !== "waiting") {
      throw new Error("Only waiting guests can be seated");
    }

    const table = db.prepare(`
      SELECT id,seats,area,status
      FROM restaurant_tables WHERE id=?
    `).get(tableId) as {
      id: number;
      seats: number;
      area: string;
      status: string;
    } | undefined;

    if (!table) throw new Error("Table not found");
    if (table.status !== "free") throw new Error("Table is occupied");
    if (table.seats < guest.party_size) {
      throw new Error("Table is too small for this party");
    }

    if (
      !getSetting("allow_area_override") &&
      guest.seating_preference !== "any" &&
      guest.seating_preference !== table.area
    ) {
      throw new Error("Table does not match seating preference");
    }

    const occupied = db.prepare(`
      SELECT id FROM guests
      WHERE table_id=? AND status='seated'
      LIMIT 1
    `).get(tableId);

    if (occupied) throw new Error("Table is already assigned");

    db.prepare(`
      UPDATE restaurant_tables
      SET status='occupied',updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(tableId);

    db.prepare(`
      UPDATE guests
      SET status='seated',table_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(tableId, guestId);

    db.prepare(`
      INSERT INTO seating_history(guest_id,table_id)
      VALUES (?,?)
    `).run(guestId, tableId);

    return { success: true, guest_id: guestId, table_id: tableId };
  });

  return transaction();
}

export function releaseTable(tableId: number) {
  setupSeating();

  const transaction = db.transaction(() => {
    const table = db.prepare(
      "SELECT id FROM restaurant_tables WHERE id=?"
    ).get(tableId);

    if (!table) throw new Error("Table not found");

    db.prepare(`
      UPDATE seating_history
      SET released_at=CURRENT_TIMESTAMP
      WHERE table_id=? AND released_at IS NULL
    `).run(tableId);

    db.prepare(`
      UPDATE guests
      SET table_id=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE table_id=? AND status='seated'
    `).run(tableId);

    db.prepare(`
      UPDATE restaurant_tables
      SET status='free',updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(tableId);

    return { success: true, table_id: tableId, status: "free" };
  });

  return transaction();
}
'''.lstrip())

write("src/app/api/seating/route.ts", r'''
import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { getAssignableTables, assignTable } from "@/lib/seating-v3";

export async function GET(request: Request) {
  if (!(await currentStaff())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number(new URL(request.url).searchParams.get("guest_id"));
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid guest" }, { status: 400 });
  }

  const result = getAssignableTables(id);
  if (!result) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!(await currentStaff())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (
    !Number.isSafeInteger(body?.guest_id) ||
    !Number.isSafeInteger(body?.table_id) ||
    body.guest_id < 1 ||
    body.table_id < 1
  ) {
    return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
  }

  try {
    return NextResponse.json(assignTable(body.guest_id, body.table_id));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Assignment failed" },
      { status: 409 }
    );
  }
}
'''.lstrip())

write("src/app/api/waiter/tables/[id]/free/route.ts", r'''
import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { releaseTable } from "@/lib/seating-v3";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const staff = await currentStaff();
  if (!staff || !["manager","reception"].includes(staff.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const { id } = await context.params;
  const tableId = Number(id);

  if (!Number.isSafeInteger(tableId) || tableId < 1) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }

  try {
    return NextResponse.json(releaseTable(tableId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to release" },
      { status: 409 }
    );
  }
}
'''.lstrip())

write("src/app/api/management/seating-settings/route.ts", r'''
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { currentStaff } from "@/lib/staff-auth";
import { getSetting, setupSeating } from "@/lib/seating-v3";

export async function GET() {
  const staff = await currentStaff();
  if (staff?.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    require_table_assignment: getSetting("require_table_assignment"),
    allow_area_override: getSetting("allow_area_override")
  });
}

export async function PATCH(request: Request) {
  const staff = await currentStaff();
  if (staff?.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (
    typeof body?.require_table_assignment !== "boolean" ||
    typeof body?.allow_area_override !== "boolean"
  ) {
    return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  }

  setupSeating();

  const update = db.prepare(`
    INSERT INTO seating_settings(key,value)
    VALUES (?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `);

  db.transaction(() => {
    update.run("require_table_assignment", String(body.require_table_assignment));
    update.run("allow_area_override", String(body.allow_area_override));
  })();

  return NextResponse.json({ success: true });
}
'''.lstrip())

write("src/components/seat-guest-modal.tsx", r'''
"use client";

import { useEffect, useState } from "react";
import { X, Armchair } from "lucide-react";

type Table = {
  id: number;
  name: string;
  seats: number;
  area: string;
};

type Guest = {
  id: number;
  name: string;
  party_size: number;
  seating_preference: string;
};

export default function SeatGuestModal({
  guest,
  onClose,
  onSuccess
}: {
  guest: Guest;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [tables, setTables] = useState<Table[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/seating?guest_id=${guest.id}`, { cache: "no-store" })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Unable to load tables");
        return data;
      })
      .then(data => setTables(data.tables))
      .catch(e => setError(e.message));
  }, [guest.id]);

  async function confirm() {
    if (selected === null || busy) return;
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/seating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_id: guest.id,
          table_id: selected
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to seat guest");

      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assignment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Assign table"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#17202A] p-6 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Assign table</h2>
          <button onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-300">
          {guest.name} · {guest.party_size} guests ·{" "}
          {guest.seating_preference || "any"} preference
        </p>

        <div className="mt-5 space-y-2">
          {tables.map(table => {
            const preferred =
              guest.seating_preference === "any" ||
              guest.seating_preference === table.area;

            return (
              <button
                key={table.id}
                type="button"
                onClick={() => setSelected(table.id)}
                className={`flex w-full items-center justify-between rounded-xl border p-4 text-left ${
                  selected === table.id
                    ? "border-[#C5A77B] bg-[#C5A77B]/10"
                    : "border-white/10 bg-[#0D1218]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Armchair size={20} className="text-[#C5A77B]" />
                  <div>
                    <p className="font-semibold">{table.name}</p>
                    <p className="text-xs text-slate-400">
                      {table.seats} seats · {table.area}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-[#C5A77B]">
                  {preferred ? "Preferred" : "Other area"}
                </span>
              </button>
            );
          })}
        </div>

        {tables.length === 0 && !error && (
          <p className="mt-5 text-sm text-slate-400">
            No suitable free tables currently available.
          </p>
        )}

        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}

        <button
          onClick={() => void confirm()}
          disabled={selected === null || busy}
          className="mt-6 w-full rounded-xl bg-[#C5A77B] px-5 py-3 font-semibold text-[#101820] disabled:opacity-40"
        >
          {busy ? "Assigning..." : "Assign table & seat guest"}
        </button>
      </div>
    </div>
  );
}
'''.lstrip())

write("src/components/seating-settings.tsx", r'''
"use client";

import { useEffect, useState } from "react";

export default function SeatingSettings() {
  const [required, setRequired] = useState(true);
  const [override, setOverride] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/management/seating-settings")
      .then(r => r.json())
      .then(d => {
        if (typeof d.require_table_assignment === "boolean")
          setRequired(d.require_table_assignment);
        if (typeof d.allow_area_override === "boolean")
          setOverride(d.allow_area_override);
      })
      .catch(() => setMessage("Could not load settings"));
  }, []);

  async function save() {
    setMessage("");

    const response = await fetch("/api/management/seating-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        require_table_assignment: required,
        allow_area_override: override
      })
    });

    setMessage(response.ok ? "Settings saved." : "Could not save settings.");
  }

  return (
    <section className="mt-7 rounded-2xl border border-white/10 bg-[#17202A] p-6">
      <h2 className="text-xl font-semibold">Seating preferences</h2>

      <label className="mt-5 flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={required}
          onChange={e => setRequired(e.target.checked)}
        />
        Require table assignment before seating a guest
      </label>

      <label className="mt-4 flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={override}
          onChange={e => setOverride(e.target.checked)}
        />
        Allow seating in a different area if preferred area is unavailable
      </label>

      <button
        onClick={() => void save()}
        className="mt-5 rounded-xl bg-[#C5A77B] px-5 py-3 font-semibold text-[#101820]"
      >
        Save seating settings
      </button>

      {message && <p className="mt-3 text-sm">{message}</p>}
    </section>
  );
}
'''.lstrip())

write("src/app/api/management/demo/route.ts", r'''
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { currentStaff } from "@/lib/staff-auth";

export async function POST(request: Request) {
  const staff = await currentStaff();

  if (staff?.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
'''.lstrip())

write("src/components/demo-controls.tsx", r'''
"use client";

import { useState } from "react";

export default function DemoControls() {
  const [message, setMessage] = useState("");

  async function generate() {
    setMessage("");

    const response = await fetch("/api/management/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate" })
    });

    const data = await response.json();
    setMessage(
      response.ok
        ? `Created ${data.created} demo guests.`
        : data.error || "Could not generate demo data"
    );
  }

  return (
    <section className="mt-7 rounded-2xl border border-white/10 bg-[#17202A] p-6">
      <h2 className="text-xl font-semibold">Demo mode</h2>
      <p className="mt-2 text-sm text-slate-400">
        Generate five sample waiting guests to test table assignment.
      </p>
      <button
        onClick={() => void generate()}
        className="mt-4 rounded-xl bg-[#C5A77B] px-5 py-3 font-semibold text-[#101820]"
      >
        Generate test guests
      </button>
      {message && <p className="mt-3 text-sm">{message}</p>}
    </section>
  );
}
'''.lstrip())

# Extend the existing management page without replacing its settings.
p = root / "src/app/management/page.tsx"
s = p.read_text()
for imp in [
    'import SeatingSettings from "@/components/seating-settings";',
    'import DemoControls from "@/components/demo-controls";'
]:
    if imp not in s:
        directive = '"use client";'
        if directive not in s:
            raise RuntimeError("Management page missing use client")
        s = s.replace(directive, directive + "\n" + imp, 1)

if "<SeatingSettings />" not in s:
    anchor = "<ManagementExtras />"
    if anchor not in s:
        raise RuntimeError("Could not locate management extras")
    s = s.replace(anchor, anchor + "\n        <SeatingSettings />\n        <DemoControls />", 1)

write("src/app/management/page.tsx", s)

print("\nCore seating upgrade files created.")
print("Next: wire the Seat Guest action into the existing dashboard.")

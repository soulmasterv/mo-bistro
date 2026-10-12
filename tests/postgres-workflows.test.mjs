import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  load,
  harness,
  request,
  context,
  requireDependency,
} from "./handler-harness.mjs";

const packagePath = process.env.MO_BISTRO_TEST_PGLITE;
const PGlite = packagePath ? requireDependency(packagePath).PGlite : null;
// No URL accepted: the test engine is always an empty in-memory database.
function sqlAdapter(database) {
  const sql = async (strings, ...values) => {
    let query = "",
      params = [];
    for (let index = 0; index < strings.length; index++) {
      query += strings[index];
      if (index < values.length) {
        params.push(values[index]);
        query += "$" + params.length;
      }
    }
    return (await database.query(query, params)).rows;
  };
  sql.begin = (callback) =>
    database.transaction((tx) => callback(sqlAdapter(tx)));
  return sql;
}
async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync("migrations/001_postgres_schema.sql", "utf8"));
  await db.exec(
    "INSERT INTO staff_users(username,role,credential_hash) VALUES ('manager','manager','test'),('reception','reception','test'); INSERT INTO restaurant_tables(name,seats,area) VALUES ('Indoor 1',4,'indoor'),('Indoor 2',4,'indoor'),('Outdoor 1',4,'outdoor');",
  );
  return db;
}
function routes(db) {
  const h = harness();
  h.mocks["@/lib/postgres-db"] = { getPostgres: () => sqlAdapter(db) };
  return h;
}

test(
  "Shift TIME columns work; missing PIN schema and legacy time representations are repaired",
  { skip: !PGlite },
  async () => {
    const db = await setup();
    try {
      await db.exec(
        fs.readFileSync("migrations/20261011_staff_shifts.sql", "utf8"),
      );
      await db.query("SELECT to_char(start_time,'HH24:MI') FROM staff_shifts");
      await assert.rejects(
        db.query("SELECT to_char('09:30'::text,'HH24:MI')"),
        (error) => error.code === "42883",
      );
      await assert.rejects(
        db.query("SELECT pin_hash FROM staff_users"),
        (error) => error.code === "42703",
      );
      const repair = fs.readFileSync(
        "migrations/20261012_staff_schema_repair.sql",
        "utf8",
      );
      await db.exec(repair);
      await db.exec(repair);
      const h = routes(db);
      const response = await h
        .route("management/staff-shifts")
        .PUT(
          request("PUT", {
            staff_id: 2,
            weekday: 0,
            is_off: false,
            start_time: "22:00",
            end_time: "06:00",
          }),
        );
      assert.equal(response.status, 200);
      const shifts = await h.route("management/staff-shifts").GET();
      assert.equal(shifts.status, 200);
      const data = await shifts.json();
      assert.equal(data.shifts[0].start_time, "22:00");
      assert.equal(data.shifts[0].end_time, "06:00");
      const users = await h.route("management/staff-pin/users").GET();
      assert.equal((await users.json()).pin_supported, true);
      await db.exec(
        "INSERT INTO staff_sessions(id_hash,staff_id,expires_at) VALUES ('test-session',2,9999999999999)",
      );
      assert.equal(
        (
          await h
            .route("management/staff-pin")
            .PATCH(request("PATCH", { staff_id: 2, pin: "482719" }))
        ).status,
        200,
      );
      assert.equal(
        (
          await db.query(
            "SELECT COUNT(*)::integer AS count FROM staff_sessions WHERE staff_id=2",
          )
        ).rows[0].count,
        0,
      );
      assert.equal(
        (
          await h
            .route("management/staff")
            .POST(
              request("POST", {
                username: "waiter",
                role: "waiter",
                credential: "test-password",
              }),
            )
        ).status,
        201,
      );
      await assert.rejects(
        db.exec(
          "INSERT INTO staff_shifts(staff_id,weekday,is_off) VALUES (2,9,true)",
        ),
      );
    } finally {
      await db.close();
    }
  },
);

test(
  "Staff repair converts valid legacy text hours and retains constraints",
  { skip: !PGlite },
  async () => {
    const db = await setup();
    try {
      await db.exec(
        "CREATE TABLE staff_shifts(staff_id integer,weekday integer,start_time text,end_time text,is_off boolean); INSERT INTO staff_shifts VALUES(2,0,'09:30','17:00',false)",
      );
      await db.exec(
        fs.readFileSync("migrations/20261012_staff_schema_repair.sql", "utf8"),
      );
      assert.equal(
        (
          await db.query(
            "SELECT data_type FROM information_schema.columns WHERE table_name='staff_shifts' AND column_name='start_time'",
          )
        ).rows[0].data_type,
        "time without time zone",
      );
      assert.equal(
        (
          await db.query(
            "SELECT LEFT(start_time::text,5) AS start_time FROM staff_shifts",
          )
        ).rows[0].start_time,
        "09:30",
      );
      await assert.rejects(
        db.exec(
          "INSERT INTO staff_shifts(staff_id,weekday,is_off) VALUES(2,0,true)",
        ),
      );
      await assert.rejects(
        db.exec(
          "INSERT INTO staff_shifts(staff_id,weekday,is_off) VALUES(999,1,true)",
        ),
      );
    } finally {
      await db.close();
    }
  },
);

test(
  "Anonymous seating, retry-safe freeing and request approval never change named records",
  { skip: !PGlite },
  async () => {
    const db = await setup();
    try {
      for (const file of [
        "20261010_area_table_requests.sql",
        "20261010_table_ready_requests.sql",
        "20261012_request_schema_repair.sql",
        "20261012_staff_schema_repair.sql",
        "20261012_simple_inventory.sql",
      ])
        await db.exec(fs.readFileSync(path.join("migrations", file), "utf8"));
      await db.exec(
        fs.readFileSync("migrations/20261012_simple_inventory.sql", "utf8"),
      );
      await db.exec(
        "INSERT INTO staff_users(username,role,credential_hash) VALUES ('waiter','waiter','test'); INSERT INTO guests(name,phone,party_size,seating_preference) VALUES ('Guest One','01012345678',2,'indoor'),('Guest Two','01012345679',2,'indoor'),('Guest Three','01012345670',2,'outdoor'),('Guest Four','01012345671',2,'any');",
      );
      const h = routes(db),
        mode = h.route("table-view-mode"),
        seating = h.route("seating"),
        free = h.route("simple-tables");
      const namedBefore = (
        await db.query("SELECT * FROM restaurant_tables ORDER BY id")
      ).rows;
      assert.equal(
        (await mode.PATCH(request("PATCH", { mode: "simple" }))).status,
        200,
      );
      assert.equal(
        (await seating.POST(request("POST", { guest_id: 1, area: "indoor" })))
          .status,
        200,
      );
      assert.equal(
        (
          await free.PUT(
            request("PUT", {
              area: "indoor",
              total_tables: 0,
              max_party_size: 4,
            }),
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await seating.POST(
            request("POST", { guest_id: 2, area: "indoor", table_id: 1 }),
          )
        ).status,
        400,
      );
      h.state.actor = { id: 99, role: "reception" };
      assert.equal(
        (
          await free.POST(
            request("POST", { area: "indoor", operation_id: randomUUID() }),
          )
        ).status,
        500,
      );
      assert.equal(
        (
          await db.query(
            "SELECT occupied_tables FROM simple_table_capacity WHERE area='indoor'",
          )
        ).rows[0].occupied_tables,
        1,
      );
      h.state.actor = { id: 1, role: "manager" };
      assert.equal(
        (await mode.PATCH(request("PATCH", { mode: "detailed" }))).status,
        409,
      );
      assert.equal(
        (await seating.POST(request("POST", { guest_id: 2, table_id: 1 })))
          .status,
        409,
      );
      assert.equal(
        (
          await h
            .route("waiter/tables/[id]/free")
            .POST(request("POST"), context(1))
        ).status,
        409,
      );
      h.state.actor = { id: 3, role: "waiter" };
      assert.equal(
        (await seating.POST(request("POST", { guest_id: 2, area: "indoor" })))
          .status,
        403,
      );
      assert.equal(
        (
          await h
            .route("waiter/tables/[id]/free")
            .POST(request("POST"), context(1))
        ).status,
        403,
      );
      assert.equal(
        (
          await free.POST(
            request("POST", { area: "indoor", operation_id: randomUUID() }),
          )
        ).status,
        403,
      );
      h.state.actor = { id: 2, role: "reception" };
      const operation = randomUUID();
      assert.equal(
        (
          await free.POST(
            request("POST", { area: "indoor", operation_id: operation }),
          )
        ).status,
        200,
      );
      const retry = await free.POST(
        request("POST", { area: "indoor", operation_id: operation }),
      );
      assert.equal(retry.status, 200);
      assert.equal((await retry.json()).repeated, true);
      assert.equal(
        (
          await free.POST(
            request("POST", { area: "indoor", operation_id: randomUUID() }),
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await free.POST(
            request("POST", { area: "outdoor", operation_id: operation }),
          )
        ).status,
        409,
      );
      assert.equal(
        (await seating.POST(request("POST", { guest_id: 2, area: "indoor" })))
          .status,
        200,
      );
      h.state.actor = { id: 3, role: "waiter" };
      const create = await h
        .route("waiter/area-requests")
        .POST(request("POST", { area: "indoor" }));
      assert.equal(create.status, 201);
      const pending = (await create.json()).request_id;
      assert.equal(
        (
          await h
            .route("waiter/area-requests")
            .POST(request("POST", { area: "indoor" }))
        ).status,
        409,
      );
      h.state.actor = { id: 1, role: "manager" };
      assert.equal(
        (await mode.PATCH(request("PATCH", { mode: "detailed" }))).status,
        409,
      );
      h.state.actor = { id: 2, role: "reception" };
      assert.equal(
        (
          await h
            .route("reception/table-requests/[id]")
            .PATCH(request("PATCH", { action: "approve" }), context(pending))
        ).status,
        200,
      );
      assert.equal(
        (
          await h
            .route("reception/table-requests/[id]")
            .PATCH(request("PATCH", { action: "approve" }), context(pending))
        ).status,
        409,
      );
      assert.equal(
        (await seating.POST(request("POST", { guest_id: 3, area: "outdoor" })))
          .status,
        200,
      );
      h.state.actor = { id: 3, role: "waiter" };
      const rejected = await h
        .route("waiter/area-requests")
        .POST(request("POST", { area: "outdoor" }));
      assert.equal(rejected.status, 201);
      h.state.actor = { id: 2, role: "reception" };
      assert.equal(
        (
          await h
            .route("reception/table-requests/[id]")
            .PATCH(
              request("PATCH", { action: "reject" }),
              context((await rejected.json()).request_id),
            )
        ).status,
        200,
      );
      assert.equal(
        (
          await db.query(
            "SELECT occupied_tables FROM simple_table_capacity WHERE area='outdoor'",
          )
        ).rows[0].occupied_tables,
        1,
      );
      assert.equal(
        (
          await free.POST(
            request("POST", { area: "outdoor", operation_id: randomUUID() }),
          )
        ).status,
        200,
      );
      assert.deepEqual(
        (await db.query("SELECT * FROM restaurant_tables ORDER BY id")).rows,
        namedBefore,
      );
      assert.equal(
        (
          await db.query(
            "SELECT COUNT(*)::integer AS count FROM seating_history",
          )
        ).rows[0].count,
        0,
      );
      assert.ok(
        (
          await db.query("SELECT table_id FROM guests WHERE status='seated'")
        ).rows.every((guest) => guest.table_id === null),
      );
      h.state.actor = { id: 1, role: "manager" };
      assert.equal(
        (await mode.PATCH(request("PATCH", { mode: "detailed" }))).status,
        200,
      );
      assert.equal(
        (await seating.POST(request("POST", { guest_id: 4, table_id: 1 })))
          .status,
        200,
      );
      assert.equal(
        (await mode.PATCH(request("PATCH", { mode: "simple" }))).status,
        409,
      );
      assert.equal(
        (
          await free.POST(
            request("POST", { area: "indoor", operation_id: randomUUID() }),
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await h
            .route("waiter/tables/[id]/free")
            .POST(request("POST"), context(1))
        ).status,
        200,
      );
      assert.equal(
        (await mode.PATCH(request("PATCH", { mode: "simple" }))).status,
        200,
      );
      await assert.rejects(
        db.exec(
          "UPDATE simple_table_capacity SET occupied_tables=total_tables+1 WHERE area='indoor'",
        ),
      );
      await assert.rejects(
        db.exec(
          "UPDATE simple_table_capacity SET occupied_tables=-1 WHERE area='indoor'",
        ),
      );
      const legacy = (
        await db.query(
          "INSERT INTO table_ready_requests(table_id,requested_by,inventory_mode) VALUES(1,3,'detailed') RETURNING id",
        )
      ).rows[0].id;
      assert.equal(
        (
          await h
            .route("reception/table-requests/[id]")
            .PATCH(request("PATCH", { action: "approve" }), context(legacy))
        ).status,
        409,
      );
      assert.equal(
        (
          await h
            .route("reception/table-requests/[id]")
            .PATCH(request("PATCH", { action: "reject" }), context(legacy))
        ).status,
        200,
      );
    } finally {
      await db.close();
    }
  },
);

test("Manager workspace selector is visible only to Managers", () => {
  const { renderToStaticMarkup } = requireDependency("react-dom/server");
  const Component = load("src/components/workspace-header.tsx", {
    "next/link": ({ children, ...props }) =>
      requireDependency("react").createElement("a", props, children),
  }).default;
  for (const role of ["manager", "reception", "waiter"]) {
    const markup = renderToStaticMarkup(
      requireDependency("react").createElement(Component, {
        role,
        workspace: "Reception",
      }),
    );
    assert.equal(markup.includes("Switch Workspace"), role === "manager");
    if (role === "manager")
      for (const workspace of ["Management", "Reception", "Waiter"])
        assert.match(markup, new RegExp(workspace));
  }
});

test("Workspace page authorization rejects role escalation independently of navigation", async () => {
  for (const role of ["manager", "reception", "waiter", null]) {
    const h = harness({ actor: role ? { id: 1, role } : null });
    const redirects = [];
    h.mocks["next/navigation"] = {
      redirect: (destination) => {
        redirects.push(destination);
        throw new Error("REDIRECT");
      },
    };
    const { requireStaffPage } = load("src/lib/require-staff-page.ts", h.mocks);
    for (const allowed of [
      ["manager"],
      ["manager", "reception"],
      ["manager", "waiter"],
    ]) {
      if (role && allowed.includes(role))
        assert.equal((await requireStaffPage(allowed)).role, role);
      else await assert.rejects(requireStaffPage(allowed), /REDIRECT/);
    }
  }
});

test("Cross-site metadata and malformed credential hashes fail safely", async () => {
  const h = harness();
  const { rejectCrossOrigin } = load("src/lib/guest-api-security.ts", h.mocks);
  assert.equal(
    rejectCrossOrigin(request("POST", {}, { "sec-fetch-site": "cross-site" }))
      .status,
    403,
  );
  assert.equal(
    rejectCrossOrigin(request("POST", {}, { origin: "ftp://bistro.test" }))
      .status,
    403,
  );
  const { hashCredential, verifyCredential } = load(
    "src/lib/staff-auth-utils.ts",
    { "next/headers": { cookies: async () => ({}) } },
  );
  for (const invalid of ["", "salt:00", "a".repeat(100000) + ":ff"])
    assert.equal(verifyCredential("test", invalid), false);
  const hash = hashCredential("test-secret");
  assert.equal(verifyCredential("test-secret", hash), true);
  assert.equal(verifyCredential("wrong", hash), false);
});

test(
  "Staff repair rejects invalid legacy rows and rolls back schema changes",
  { skip: !PGlite },
  async () => {
    const db = await setup();
    try {
      await db.exec(
        "CREATE TABLE staff_shifts(staff_id integer,weekday integer,start_time text,end_time text,is_off boolean); INSERT INTO staff_shifts VALUES(2,99,'09:30','17:00',false)",
      );
      await assert.rejects(
        db.exec(
          fs.readFileSync(
            "migrations/20261012_staff_schema_repair.sql",
            "utf8",
          ),
        ),
      );
      await db.exec("ROLLBACK");
      assert.equal(
        (await db.query("SELECT weekday FROM staff_shifts")).rows[0].weekday,
        99,
      );
      assert.equal(
        (
          await db.query(
            "SELECT data_type FROM information_schema.columns WHERE table_name='staff_shifts' AND column_name='start_time'",
          )
        ).rows[0].data_type,
        "text",
      );
      await assert.rejects(
        db.query("SELECT pin_hash FROM staff_users"),
        (error) => error.code === "42703",
      );
    } finally {
      await db.close();
    }
  },
);

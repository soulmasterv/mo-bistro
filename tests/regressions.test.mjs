import test from "node:test";
import assert from "node:assert/strict";
import {
  load,
  harness,
  request,
  context,
  requireDependency,
} from "./handler-harness.mjs";

test("Unread IDs reconcile disappearing, duplicate, initial and visible requests", () => {
  const { reconcileRequestIds } = load("src/lib/request-notifications.ts");
  let previous = null,
    unread = new Set();
  for (const [pending, open, expected, added] of [
    [[1, 1], false, [1], []],
    [[1, 2], false, [1, 2], [2]],
    [[1, 2], false, [1, 2], []],
    [[2], false, [2], []],
    [[], false, [], []],
    [[3], true, [], [3]],
    [[3], false, [], []],
  ]) {
    const ids = new Set(pending);
    const result = reconcileRequestIds(ids, previous, unread, open);
    assert.deepEqual([...result.unread], expected);
    assert.deepEqual([...result.added], added);
    previous = ids;
    unread = result.unread;
  }
});

test("Staff list handles missing PIN column visibly, preserving accounts and no-store", async () => {
  const h = harness({
    query: (q) =>
      q.includes("information_schema")
        ? [{ pin_supported: false }]
        : [{ id: 1, role: "manager", active: 1, has_pin: false }],
  });
  const response = await h.route("management/staff-pin/users").GET();
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(data.users.length, 1);
  assert.equal(data.pin_supported, false);
  assert.match(data.warning, /20261010_staff_pin_login/);
  assert.equal(data.current_staff_id, 1);
  assert.match(h.queries[1].query, /to_jsonb/);
});

test("Staff list reports authentication and database failure without exposing details", async () => {
  const h = harness({
    query: () => {
      throw Object.assign(Error("private connection detail"), {
        code: "08006",
      });
    },
  });
  const response = await h.route("management/staff-pin/users").GET();
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "Unable to load staff accounts.");
});

for (const role of [null, "waiter", "reception"]) {
  test(
    "Manager APIs deny " + (role ?? "anonymous") + " without SQL",
    async () => {
      const h = harness({ actor: role ? { id: 2, role } : null });
      for (const [file, method, body] of [
        ["management/staff-pin/users", "GET"],
        ["management/staff", "POST", {}],
        ["management/staff", "PATCH", { staff_id: 2, active: 0 }],
        ["management/staff-pin", "PATCH", {}],
        ["management/staff-shifts", "GET"],
        ["management/staff-shifts", "PUT", {}],
      ]) {
        const response = await h.route(file)[method](request(method, body));
        assert.equal(response.status, 403, file);
      }
      assert.equal(h.queries.length, 0);
    },
  );
}

for (const role of ["manager", "reception", "waiter"]) {
  test(
    "Create " +
      role +
      " account; hash credential and distinguish conflicts from failures",
    async () => {
      const h = harness({ query: () => [{ id: 8 }] });
      const route = h.route("management/staff");
      const body = { username: "employee", role, credential: "test-password" };
      assert.equal((await route.POST(request("POST", body))).status, 201);
      assert.deepEqual(h.queries[0].values, ["employee", role, "test-hash"]);
      h.state.query = () => {
        throw { code: "23505" };
      };
      assert.equal((await route.POST(request("POST", body))).status, 409);
      h.state.query = () => {
        throw { code: "23514" };
      };
      assert.equal((await route.POST(request("POST", body))).status, 503);
      h.state.query = () => {
        throw { code: "08006" };
      };
      assert.equal((await route.POST(request("POST", body))).status, 500);
    },
  );
}

test("Staff disabling prevents self and last-manager lockout; disables revoke sessions", async () => {
  const h = harness({
    query: (q) =>
      q.startsWith("SELECT id, role")
        ? [{ id: 2, role: "manager", active: 1 }]
        : q.includes("COUNT(*)")
          ? [{ count: 1 }]
          : [],
  });
  const route = h.route("management/staff");
  assert.equal(
    (await route.PATCH(request("PATCH", { staff_id: 1, active: 0 }))).status,
    400,
  );
  assert.equal(h.queries.length, 0);
  assert.equal(
    (await route.PATCH(request("PATCH", { staff_id: 2, active: 0 }))).status,
    409,
  );
  assert.ok(!h.queries.some((x) => x.query.startsWith("UPDATE")));
  h.state.query = (q) =>
    q.startsWith("SELECT id, role")
      ? [{ id: 2, role: "waiter", active: 1 }]
      : [];
  assert.equal(
    (await route.PATCH(request("PATCH", { staff_id: 2, active: 0 }))).status,
    200,
  );
  assert.ok(h.queries.some((x) => x.query.includes("pg_advisory_xact_lock")));
  assert.ok(
    h.queries.some((x) => x.query.startsWith("DELETE FROM staff_sessions")),
  );
  h.queries.length = 0;
  assert.equal(
    (await route.PATCH(request("PATCH", { staff_id: 2, active: 1 }))).status,
    200,
  );
  assert.ok(!h.queries.some((x) => x.query.startsWith("DELETE")));
});

test("PIN creation/reset requires six nontrivial digits, active account and session revocation", async () => {
  const h = harness({
    query: (q) => (q.startsWith("UPDATE staff_users") ? [{ id: 2 }] : []),
  });
  const route = h.route("management/staff-pin");
  for (const pin of ["123", "123456", "111111", "abcxyz"]) {
    assert.equal(
      (await route.PATCH(request("PATCH", { staff_id: 2, pin }))).status,
      400,
    );
  }
  assert.equal(h.queries.length, 0);
  assert.equal(
    (await route.PATCH(request("PATCH", { staff_id: 2, pin: "482719" })))
      .status,
    200,
  );
  assert.ok(h.queries.some((x) => x.query.includes("active = 1")));
  assert.ok(
    h.queries.some((x) => x.query.startsWith("DELETE FROM staff_sessions")),
  );
  h.state.query = () => [];
  assert.equal(
    (await route.PATCH(request("PATCH", { staff_id: 2, pin: "482719" })))
      .status,
    404,
  );
});

test("Shift times accept normal and overnight hours; reject invalid/off-day hours", async () => {
  const h = harness({
    query: (q) =>
      q.startsWith("SELECT id FROM staff_users") ? [{ id: 2 }] : [],
  });
  const route = h.route("management/staff-shifts");
  const body = {
    staff_id: 2,
    weekday: 0,
    is_off: false,
    start_time: "09:30",
    end_time: "17:00",
  };
  assert.equal((await route.PUT(request("PUT", body))).status, 200);
  assert.equal(
    (
      await route.PUT(
        request("PUT", { ...body, start_time: "22:00", end_time: "06:00" }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await route.PUT(
        request("PUT", {
          ...body,
          is_off: true,
          start_time: null,
          end_time: null,
        }),
      )
    ).status,
    200,
  );
  for (const changes of [
    { start_time: "24:00" },
    { start_time: "9:30" },
    { end_time: "17:60" },
    { is_off: true },
    { weekday: 7 },
  ]) {
    assert.equal(
      (await route.PUT(request("PUT", { ...body, ...changes }))).status,
      400,
    );
  }
});

for (const area of ["indoor", "outdoor"]) {
  test(
    "Waiter " + area + " requests preserve occupied-table and duplicate checks",
    async () => {
      const h = harness({
        actor: { id: 3, role: "waiter" },
        query: (q) =>
          q.includes("FROM restaurant_tables")
            ? [{ id: 5 }]
            : q.startsWith("INSERT")
              ? [{ id: 9 }]
              : [],
      });
      const route = h.route("waiter/area-requests");
      assert.equal((await route.POST(request("POST", { area }))).status, 201);
      assert.ok(
        h.queries.some((x) =>
          x.query.includes("ON CONFLICT (area, requested_by)"),
        ),
      );
      h.state.query = (q) =>
        q.includes("FROM restaurant_tables")
          ? [{ id: 5 }]
          : q.includes("FROM table_ready_requests")
            ? [{ id: 9 }]
            : [];
      assert.equal((await route.POST(request("POST", { area }))).status, 409);
      h.state.query = () => [];
      assert.equal((await route.POST(request("POST", { area }))).status, 409);
      assert.equal(
        (await route.POST(request("POST", { area: "roof" }))).status,
        400,
      );
    },
  );
}

test("Area requests deny reception and cross-origin requests", async () => {
  const h = harness({ actor: { id: 2, role: "reception" } });
  const route = h.route("waiter/area-requests");
  assert.equal(
    (await route.POST(request("POST", { area: "indoor" }))).status,
    403,
  );
  h.state.actor.role = "waiter";
  assert.equal(
    (
      await route.POST(
        request("POST", { area: "indoor" }, { origin: "https://evil.test" }),
      )
    ).status,
    403,
  );
  assert.equal(h.queries.length, 0);
});

test("Missing area migration/index returns schema guidance; connectivity stays a backend failure", async () => {
  const h = harness({
    actor: { id: 3, role: "waiter" },
    query: () => {
      throw { code: "42703" };
    },
  });
  const route = h.route("waiter/area-requests");
  for (const code of ["42703", "42P01", "42P10", "23502", "23514"]) {
    h.state.query = () => {
      throw { code };
    };
    const response = await route.POST(request("POST", { area: "indoor" }));
    assert.equal(response.status, 503);
    assert.match(
      (await response.json()).error,
      /20261012_request_schema_repair/,
    );
  }
  h.state.query = () => {
    throw { code: "08006" };
  };
  assert.equal(
    (await route.POST(request("POST", { area: "indoor" }))).status,
    500,
  );
});

test("Reception approves/rejects area requests, enforcing target area and current occupancy", async () => {
  let pending = { id: 9, table_id: null, area: "outdoor", status: "pending" };
  let table = { id: 5, area: "outdoor", status: "occupied" };
  const h = harness({
    actor: { id: 2, role: "reception" },
    query: (q) =>
      q.includes("FROM table_ready_requests")
        ? [pending]
        : q.includes("FROM restaurant_tables")
          ? [table]
          : [],
  });
  const route = h.route("reception/table-requests/[id]");
  assert.equal(
    (await route.PATCH(request("PATCH", { action: "approve" }), context(9)))
      .status,
    400,
  );
  table.area = "indoor";
  assert.equal(
    (
      await route.PATCH(
        request("PATCH", { action: "approve", table_id: 5 }),
        context(9),
      )
    ).status,
    409,
  );
  table.area = "outdoor";
  table.status = "free";
  assert.equal(
    (
      await route.PATCH(
        request("PATCH", { action: "approve", table_id: 5 }),
        context(9),
      )
    ).status,
    409,
  );
  table.status = "occupied";
  h.queries.length = 0;
  const response = await route.PATCH(
    request("PATCH", { action: "approve", table_id: 5 }),
    context(9),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).table_id, 5);
  for (const target of [
    "seating_history",
    "guests",
    "restaurant_tables",
    "table_ready_requests",
  ]) {
    assert.ok(
      h.queries.some((x) => x.query.startsWith("UPDATE " + target)),
      target,
    );
  }
  h.queries.length = 0;
  assert.equal(
    (await route.PATCH(request("PATCH", { action: "reject" }), context(9)))
      .status,
    200,
  );
  assert.ok(
    !h.queries.some((x) => x.query.startsWith("UPDATE restaurant_tables")),
  );
  pending.status = "approved";
  assert.equal(
    (
      await route.PATCH(
        request("PATCH", { action: "approve", table_id: 5 }),
        context(9),
      )
    ).status,
    409,
  );
  h.state.actor.role = "waiter";
  assert.equal(
    (await route.PATCH(request("PATCH", { action: "reject" }), context(9)))
      .status,
    403,
  );
});

test("Table-specific approval returns actual target rather than an unrelated supplied table ID", async () => {
  const h = harness({
    query: (q) =>
      q.includes("FROM table_ready_requests")
        ? [{ id: 9, table_id: 5, area: null, status: "pending" }]
        : q.includes("FROM restaurant_tables")
          ? [{ id: 5, area: "indoor", status: "occupied" }]
          : [],
  });
  const response = await h
    .route("reception/table-requests/[id]")
    .PATCH(request("PATCH", { action: "approve", table_id: 999 }), context(9));
  assert.equal((await response.json()).table_id, 5);
});

test("Reception Clear Table releases occupancy/history and cancels stale table requests", async () => {
  const h = harness({
    actor: { id: 2, role: "reception" },
    query: (q) =>
      q.includes("FROM restaurant_tables")
        ? [{ id: 5, status: "occupied" }]
        : q.includes("to_regclass")
          ? [{ available: true }]
          : [],
  });
  const route = h.route("waiter/tables/[id]/free");
  assert.equal((await route.POST(request("POST"), context(5))).status, 200);
  for (const target of [
    "seating_history",
    "guests",
    "restaurant_tables",
    "table_ready_requests",
  ]) {
    assert.ok(
      h.queries.some((x) => x.query.startsWith("UPDATE " + target)),
      target,
    );
  }
  h.state.query = (q) =>
    q.includes("FROM restaurant_tables") ? [{ id: 5, status: "free" }] : [];
  assert.equal((await route.POST(request("POST"), context(5))).status, 409);
  assert.equal(
    (
      await route.POST(
        request("POST", undefined, { origin: "https://evil.test" }),
        context(5),
      )
    ).status,
    403,
  );
  h.state.actor = null;
  assert.equal((await route.POST(request("POST"), context(5))).status, 401);
});

test("Unconfirmed waiting guests can be seated when mandatory confirmation is disabled", async () => {
  const h = harness({
    query: (q) => {
      if (q.includes("FROM guests WHERE id="))
        return [
          {
            id: 4,
            status: "waiting",
            confirmed: 0,
            party_size: 2,
            seating_preference: "any",
          },
        ];
      if (q.includes("FROM restaurant_tables WHERE id="))
        return [{ id: 5, status: "free", seats: 4, area: "indoor" }];
      if (q.includes("FROM seating_settings")) return [{ value: "true" }];
      return [];
    },
  });
  const { assignTablePostgres } = load("src/lib/seating-postgres.ts", h.mocks);
  assert.equal((await assignTablePostgres(4, 5)).success, true);
});

test("Disabling confirmation affects existing guest display without modifying stored confirmation", async () => {
  const h = harness({
    approval: "false",
    query: (q) =>
      q.includes("COUNT(*)")
        ? [{ count: 0 }]
        : [
            {
              id: 4,
              name: "Test Guest",
              party_size: 2,
              status: "waiting",
              confirmed: 0,
              created_at: "2026-10-12",
            },
          ],
  });
  const response = await h
    .route("track")
    .GET(new Request("https://bistro.test/api/track?token=" + "a".repeat(64)));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.confirmation_required, false);
  assert.equal(data.guest.confirmed, false);
  assert.equal(data.queue_position, 1);
  assert.ok(!h.queries.some((x) => x.query.startsWith("UPDATE")));
});

test("Guest cancellation and staff queue actions do not depend on confirmation", async () => {
  const h = harness({ query: () => [{ id: 4 }] });
  assert.equal(
    (
      await h
        .route("track")
        .PATCH(request("PATCH", { token: "a".repeat(64), action: "cancel" }))
    ).status,
    200,
  );
  for (const action of ["call", "no_show", "cancel", "confirm"]) {
    assert.equal(
      (
        await h
          .route("guests/[id]")
          .PATCH(request("PATCH", { action }), context(4))
      ).status,
      200,
    );
  }
});

test("Reception request polling skips overlaps and ignores an aborted late response", async () => {
  const callbacks = [],
    states = [],
    pending = [];
  const react = {
    useState(initial) {
      const index = states.length;
      states.push(initial);
      return [
        initial,
        (value) => {
          states[index] =
            typeof value === "function" ? value(states[index]) : value;
        },
      ];
    },
    useRef: (initial) => ({ current: initial }),
    useEffect() {},
    useCallback(fn) {
      callbacks.push(fn);
      return fn;
    },
  };
  const Component = load(
    "src/components/reception-table-requests.tsx",
    {
      react,
      "@/components/seat-guest-modal": () => null,
    },
    {
      fetch: (url, options) =>
        new Promise((resolve) => pending.push({ url, options, resolve })),
    },
  ).default;
  Component();
  const refresh = callbacks[0];
  const old = refresh();
  await refresh();
  assert.equal(pending.length, 1);
  const fresh = refresh(true);
  assert.equal(pending.length, 2);
  assert.equal(pending[0].options.signal.aborted, true);
  pending[1].resolve(Response.json([]));
  await new Promise((resolve) => setImmediate(resolve));
  await fresh;
  pending[0].resolve(Response.json([{ id: 99, table_id: 5 }]));
  await old;
  assert.equal(states[0].length, 0);
  assert.equal(states[2].size, 0);
});

test("Both Reception table views expose Clear Table only for occupied tables", () => {
  const { renderToStaticMarkup } = requireDependency("react-dom/server");
  for (const mode of ["simple", "detailed"]) {
    let index = 0;
    const tables = [
      { id: 5, name: "Indoor 1", area: "indoor", seats: 4, status: "occupied" },
      { id: 6, name: "Outdoor 1", area: "outdoor", seats: 4, status: "free" },
    ];
    const pools = [
      {
        area: "indoor",
        total_tables: 1,
        occupied_tables: 1,
        free_tables: 0,
        max_party_size: 4,
      },
      {
        area: "outdoor",
        total_tables: 1,
        occupied_tables: 0,
        free_tables: 1,
        max_party_size: 4,
      },
    ];
    const values = [
      mode === "detailed" ? tables : [],
      mode,
      pools,
      null,
      "",
      null,
      "",
    ];
    const react = {
      ...requireDependency("react"),
      useState: (initial) => [
        index < values.length ? values[index++] : initial,
        () => {},
      ],
      useRef: (initial) => ({ current: initial }),
      useEffect() {},
      useCallback: (fn) => fn,
    };
    const Component = load("src/components/table-availability.tsx", {
      react,
    }).default;
    const markup = renderToStaticMarkup(Component());
    assert.match(markup, mode === "simple" ? /Table free/ : /Clear Table/);
    if (mode === "simple") assert.ok(!markup.includes("Choose occupied table"));
    else assert.match(markup, /Clear Indoor 1/);
    assert.ok(!markup.includes("Clear Outdoor 1"));
  }
});

test("Reception queue badges and QR dialog contain accessible Mo Bistro copy", () => {
  const { renderToStaticMarkup } = requireDependency("react-dom/server");
  let index = 0;
  const guests = [
    {
      id: 1,
      name: "Test Called",
      phone: "",
      party_size: 2,
      status: "called",
      confirmed: 0,
      seating_preference: "any",
    },
    {
      id: 2,
      name: "Test Uncalled",
      phone: "",
      party_size: 2,
      status: "waiting",
      confirmed: 0,
      seating_preference: "any",
    },
  ];
  const values = [
    guests,
    null,
    "",
    "all",
    null,
    false,
    true,
    "https://bistro.test/join",
    "",
    "",
    2,
    "any",
    false,
    "",
    "",
  ];
  const react = {
    ...requireDependency("react"),
    useState: (initial) => [
      index < values.length ? values[index++] : initial,
      () => {},
    ],
    useRef: (initial) => ({ current: initial }),
    useEffect() {},
    useCallback: (fn) => fn,
  };
  const mocks = { react, "react-dom": { createPortal: (value) => value }, "@/components/confirmation-provider": {useConfirmation:()=>async()=>false} };
  for (const component of [
    "reception-table-requests",
    "table-ready-notifications",
    "seat-guest-modal",
    "table-availability",
    "restaurant-wait-slider",
  ])
    mocks["@/components/" + component] = () => null;
  const Component = load("src/app/reception-dashboard.tsx", mocks, {
    document: { body: {} },
  }).default;
  const markup = renderToStaticMarkup(Component());
  assert.match(markup, /Mo Bistro/);
  assert.match(markup, /Scan this QR code to join the waitlist\./);
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /aria-describedby="qr-instructions"/);
  assert.match(markup, /Uncalled/);
  assert.match(markup, />Called</);
  assert.ok(!markup.includes("Restaurant Concierge"));
});

test("Staff account and shift operations retain authentication after licensing removal", async () => {
  const h = harness({ actor: null });
  for (const [file, method, body] of [
    ["management/staff-pin/users", "GET"],
    ["management/staff", "POST", {}],
    ["management/staff", "PATCH", { staff_id: 2, active: 0 }],
    ["management/staff-pin", "PATCH", {}],
    ["management/staff-shifts", "GET"],
    ["management/staff-shifts", "PUT", {}],
  ]) assert.equal((await h.route(file)[method](request(method, body))).status, 403, file);
  assert.equal(h.queries.length, 0);
});

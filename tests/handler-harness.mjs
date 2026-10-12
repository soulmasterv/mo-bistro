import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const requireDependency = createRequire(import.meta.url);

// Execute the actual handlers with isolated auth/license/SQL boundaries. No DB URL
// or real database client is loaded. These are regression tests, not live DB tests.
function load(file, mocks = {}, globals = {}, cache = new Map()) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  vm.runInNewContext(
    source,
    {
      module: loadedModule,
      exports: loadedModule.exports,
      console: { error() {}, log() {} },
      process: { env: { MO_BISTRO_DB: "postgres" } },
      Buffer,
      URL,
      Request,
      Response,
      AbortController,
      Set,
      Map,
      Date,
      ...globals,
      require(id) {
        if (Object.hasOwn(mocks, id)) return mocks[id];
        if (id === "server-only") return {};
        if (id === "next/server")
          return {
            NextResponse: { json: (body, init) => Response.json(body, init) },
          };
        if (id.startsWith("@/"))
          return load(
            "src/" +
              id.slice(2) +
              (fs.existsSync("src/" + id.slice(2) + ".ts") ? ".ts" : ".tsx"),
            mocks,
            globals,
            cache,
          );
        return requireDependency(id);
      },
    },
    { filename },
  );
  return loadedModule.exports;
}
function harness(options = {}) {
  const state = {
    actor: { id: 1, role: "manager", username: "manager" },
    license: true,
    ...options,
  };
  const queries = [];
  const sql = (strings, ...values) => {
    if (!strings.raw) return strings;
    const query = strings.join("?").replace(/\s+/g, " ").trim();
    queries.push({ query, values });
    return Promise.resolve(state.query ? state.query(query, values) : []);
  };
  sql.begin = async (callback) => callback(sql);
  const auth = {
    currentStaff: async () => state.actor,
    hashCredential: () => "test-hash",
    initStaff() {},
    getSetting: () => state.approval ?? "false",
  };
  const mocks = {
    "@/lib/staff-auth": auth,
    "@/lib/staff-auth-utils": { hashCredential: () => "test-hash" },
    "@/lib/postgres-db": { getPostgres: () => sql },
    "@/lib/licensing/enforce": {
      requireActiveLicense: async () =>
        state.license
          ? null
          : Response.json({ error: "Subscription inactive" }, { status: 403 }),
    },
    "@/lib/db": {},
    "@/lib/staff-auth-postgres": {
      getSettingPostgres: async () => state.approval ?? "false",
    },
    "@/lib/api-rate-limit": { checkRateLimit: async () => null },
    "@/lib/guest-eta-support": { hasGuestEtaColumn: async () => false },
  };
  return {
    state,
    sql,
    queries,
    mocks,
    route: (file) => load("src/app/api/" + file + "/route.ts", mocks),
  };
}
function request(method, body, headers = {}) {
  return new Request("https://bistro.test/api/test", {
    method,
    headers: {
      host: "bistro.test",
      origin: "https://bistro.test",
      "content-type": "application/json",
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const context = (id) => ({ params: Promise.resolve({ id: String(id) }) });

export { load, harness, request, context, requireDependency };

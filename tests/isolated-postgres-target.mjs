import fs from "node:fs";
export const ACK = "I_APPROVE_SYNTHETIC_SCHEMA_WRITES";
export function validateTarget(config, forbidden = []) {
  if (config?.ack !== ACK) throw Error("Disposable database write approval required");
  let url;
  try { url = new URL(config.url); } catch { throw Error("Invalid isolated test connection"); }
  let database, user, password;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch { throw Error("Invalid isolated connection encoding"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !/^mo_bistro_qa_[a-z0-9_]+$/.test(database) ||
      config.databaseName !== database || config.host !== url.hostname)
    throw Error("Use a verified mo_bistro_qa_* disposable database and matching host");
  if (!user || !password || url.hash || url.hostname.includes(","))
    throw Error("Use one explicit QA host and credentials; implicit connection defaults are forbidden");
  if (/-pooler(?=\.)/.test(url.hostname))
    throw Error("Use the direct QA endpoint; transaction poolers cannot preserve the bootstrap session lock");
  for (const [key, value] of url.searchParams) {
    if (key !== "sslmode" || !["require", "verify-full"].includes(value))
      throw Error("Connection query overrides are forbidden; only sslmode=require or verify-full is accepted");
  }
  for (const candidate of forbidden.filter(Boolean)) {
    let app;
    try { app = new URL(candidate); } catch { throw Error("Invalid application connection configuration; test refused"); }
    const canonicalHost = host => host.replace(/-pooler(?=\.)/, "");
    if (canonicalHost(app.hostname) === canonicalHost(url.hostname) &&
        decodeURIComponent(app.pathname.slice(1)) === database)
      throw Error("Application database is forbidden as a test target");
  }
  if (config.ssl === false && !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname))
    throw Error("Remote disposable databases require TLS");
  return { database, user, host: url.hostname, authorization: ACK,
    // Pass explicit options, never the URL: postgres.js URL query parameters
    // can override connection settings and absent credentials can use PG* vars.
    options: { host: [url.hostname.replace(/^\[|\]$/g, "")], port: [Number(url.port || 5432)],
      database, user, password, ssl: config.ssl === false ? false : "verify-full" } };
}
export function configuredTarget() {
  const index = process.argv.indexOf("--config");
  if (index >= 0) {
    try { return JSON.parse(fs.readFileSync(process.argv[index + 1], "utf8")); }
    catch { throw Error("Cannot read isolated QA config; check the secure local file"); }
  }
  const url = process.env.MO_BISTRO_ISOLATED_TEST_URL;
  if (!url) return null;
  let parsed;
  try { parsed = new URL(url); } catch { throw Error("Invalid isolated QA connection configuration"); }
  return { url, databaseName: decodeURIComponent(parsed.pathname.slice(1)), host: parsed.hostname,
    ack: process.env.MO_BISTRO_ISOLATED_DB_TEST_ACK };
}

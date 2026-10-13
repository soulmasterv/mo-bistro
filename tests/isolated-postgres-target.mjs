import fs from "node:fs";
export const ACK = "I_APPROVE_SYNTHETIC_SCHEMA_WRITES";
export function validateTarget(config, forbidden = []) {
  if (config?.ack !== ACK) throw Error("Disposable database write approval required");
  let url;
  try { url = new URL(config.url); } catch { throw Error("Invalid isolated test connection"); }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !/^mo_bistro_qa_[a-z0-9_]+$/.test(database) ||
      config.databaseName !== database || config.host !== url.hostname)
    throw Error("Use a verified mo_bistro_qa_* disposable database and matching host");
  for (const candidate of forbidden.filter(Boolean)) {
    let app;
    try { app = new URL(candidate); } catch { throw Error("Invalid application connection configuration; test refused"); }
    if (app.hostname === url.hostname && app.pathname === url.pathname)
      throw Error("Application database is forbidden as a test target");
  }
  if (config.ssl === false && !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname))
    throw Error("Remote disposable databases require TLS");
  return { url: config.url, database, ssl: config.ssl === false ? false : "require" };
}
export function configuredTarget() {
  const index = process.argv.indexOf("--config");
  if (index >= 0) return JSON.parse(fs.readFileSync(process.argv[index + 1], "utf8"));
  const url = process.env.MO_BISTRO_ISOLATED_TEST_URL;
  if (!url) return null;
  const parsed = new URL(url);
  return { url, databaseName: decodeURIComponent(parsed.pathname.slice(1)), host: parsed.hostname,
    ack: process.env.MO_BISTRO_ISOLATED_DB_TEST_ACK };
}

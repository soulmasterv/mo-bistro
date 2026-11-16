import "server-only";
import { getPostgres } from "@/lib/postgres-db";

export function featureEditorEnabled() {
  return process.env.EDIT_FEATURES === "true" && process.env.MO_BISTRO_DB === "postgres";
}

export async function waiterEnabled() {
  if (process.env.MO_BISTRO_DB !== "postgres") return true;
  const [setting] = await getPostgres()`SELECT value FROM restaurant_settings WHERE key = 'feature_waiter'`;
  return setting?.value !== "false";
}

export async function saveWaiterEnabled(enabled: boolean) {
  await getPostgres()`
    INSERT INTO restaurant_settings (key, value) VALUES ('feature_waiter', ${String(enabled)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

import "server-only";
import { getSetting } from "@/lib/staff-auth";
import { getSettingPostgres } from "@/lib/staff-auth-postgres";
export function resolveConfirmation(
  values: Record<string, string | undefined>,
) {
  // The key controlled by Management wins; legacy deployments retain a fallback.
  return (
    (values.approval_required ?? values.require_confirmation ?? "true") ===
    "true"
  );
}
export async function confirmationRequired() {
  const read =
    process.env.MO_BISTRO_DB === "postgres" ? getSettingPostgres : getSetting;
  const canonical = await read("approval_required", "__missing__");
  return resolveConfirmation({
    approval_required: canonical === "__missing__" ? undefined : canonical,
    require_confirmation:
      canonical === "__missing__"
        ? await read("require_confirmation", "true")
        : undefined,
  });
}

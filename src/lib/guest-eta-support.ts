import "server-only";
import { getPostgres } from "@/lib/postgres-db";

export async function hasGuestEtaColumn(): Promise<boolean> {
  const sql = getPostgres();

  const rows = await sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'guests'
        AND column_name = 'eta_at'
    ) AS available
  `;

  return Boolean(rows[0]?.available);
}

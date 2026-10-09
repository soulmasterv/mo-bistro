import "server-only";
import postgres from "postgres";

const globalForPostgres = globalThis as unknown as {
  moBistroPostgres?: ReturnType<typeof postgres>;
};

export function getPostgres() {
  const databaseUrl =
    process.env.MO_BISTRO_DB === "postgres"
      ? process.env.MO_BISTRO_POSTGRES_URL
      : process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("PostgreSQL database URL is not configured");
  }

  if (!globalForPostgres.moBistroPostgres) {
    globalForPostgres.moBistroPostgres = postgres(
      databaseUrl,
      {
        max: 3,
        idle_timeout: 20,
        connect_timeout: 10,
        prepare: false,
      }
    );
  }

  return globalForPostgres.moBistroPostgres;
}

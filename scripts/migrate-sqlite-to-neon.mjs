import Database from "better-sqlite3";
import postgres from "postgres";
import { existsSync } from "node:fs";

const SQLITE_PATH = process.env.SQLITE_PATH || "data/waitlist.sqlite";
const TARGET_URL = process.env.MIGRATION_DATABASE_URL;

const TABLES = [
  "staff_users",
  "staff_sessions",
  "staff_login_attempts",
  "restaurant_settings",
  "seating_settings",
  "restaurant_tables",
  "guests",
  "seating_history",
  "booking_recovery_requests",
];

if (!TARGET_URL) {
  throw new Error("MIGRATION_DATABASE_URL is required");
}

if (!existsSync(SQLITE_PATH)) {
  throw new Error(`SQLite database not found: ${SQLITE_PATH}`);
}

const sqlite = new Database(SQLITE_PATH, {
  readonly: true,
  fileMustExist: true,
});

const sql = postgres(TARGET_URL, {
  max: 1,
  connect_timeout: 10,
});

try {
  const target = await sql`
    SELECT current_database() AS database_name
  `;

  console.log("Target database:", target[0].database_name);

  const sourceCounts = {};

  for (const table of TABLES) {
    sourceCounts[table] = sqlite
      .prepare(`SELECT COUNT(*) AS count FROM "${table}"`)
      .get().count;
  }

  console.log("Source row counts:", sourceCounts);

  await sql.begin(async tx => {
    // Never merge into a database containing application records.
    for (const table of TABLES) {
      const result = await tx.unsafe(
        `SELECT COUNT(*)::integer AS count FROM "${table}"`
      );

      if (result[0].count !== 0) {
        throw new Error(
          `Target table ${table} is not empty. Migration cancelled.`
        );
      }
    }

    for (const table of TABLES) {
      const rows = sqlite
        .prepare(`SELECT * FROM "${table}"`)
        .all();

      if (rows.length === 0) {
        console.log(`${table}: 0 rows`);
        continue;
      }

      const columns = Object.keys(rows[0]);

      // SQL identifiers are from the fixed TABLES list and
      // SQLite's actual column names, not user input.
      const columnSql = columns
        .map(column => `"${column.replaceAll('"', '""')}"`)
        .join(", ");

      const placeholders = columns
        .map((_, index) => `$${index + 1}`)
        .join(", ");

      const insertSql =
        `INSERT INTO "${table}" (${columnSql}) VALUES (${placeholders})`;

      for (const row of rows) {
        await tx.unsafe(
          insertSql,
          columns.map(column => row[column])
        );
      }

      console.log(`${table}: ${rows.length} rows copied`);
    }

    for (const table of [
      "staff_users",
      "restaurant_tables",
      "guests",
      "seating_history",
      "booking_recovery_requests",
    ]) {
      await tx.unsafe(`
        SELECT setval(
          pg_get_serial_sequence('"${table}"', 'id'),
          COALESCE((SELECT MAX(id) FROM "${table}"), 1),
          (SELECT COUNT(*) > 0 FROM "${table}")
        )
      `);
    }

    for (const table of TABLES) {
      const result = await tx.unsafe(
        `SELECT COUNT(*)::integer AS count FROM "${table}"`
      );

      if (result[0].count !== sourceCounts[table]) {
        throw new Error(
          `Verification failed for ${table}: ` +
          `${result[0].count} != ${sourceCounts[table]}`
        );
      }
    }

    console.log("All row-count checks passed.");
  });

  console.log("Migration committed successfully.");
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
} finally {
  sqlite.close();
  await sql.end();
}

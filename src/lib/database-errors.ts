/** PostgreSQL SQLSTATE only: never return SQL, parameters or connection details. */
export function databaseErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
}
export function databaseFailure(error: unknown, fallback: string, migration: string) {
  const code = databaseErrorCode(error);
  if (["42703", "42P01", "42P10", "23502", "23514"].includes(code ?? "")) {
    return { error: `Database schema is incompatible. Have an administrator review ${migration}.`, status: 503 };
  }
  return { error: fallback, status: 500 };
}

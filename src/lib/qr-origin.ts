import "server-only";

export function isAllowedQROrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;

  if (!origin) return false;

  try {
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}

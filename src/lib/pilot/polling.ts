export function pollRetryDelay(failures: number, retryAfterMs = 0, random = Math.random) {
  const base = Math.min(60_000, 12_000 * 2 ** Math.min(Math.max(0, failures - 1), 3));
  return Math.max(retryAfterMs, base) + Math.floor(random() * Math.min(base / 4, 5000));
}

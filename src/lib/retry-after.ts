/** Parse the HTTP Retry-After header as seconds or an HTTP date. */
export function retryAfterMilliseconds(header: string | null, now: number): number {
  const value = header?.trim();
  if (!value) return 0;
  const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

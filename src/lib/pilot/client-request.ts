export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  ms: number,
) {
  const controller = new AbortController();
  const parent = options.signal;
  const abort = () => controller.abort();
  let timedOut = false;
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  const timer = window.setTimeout(() => {
    timedOut = true;
    abort();
  }, ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      const timeout = new Error("Request timed out.");
      timeout.name = "TimeoutError";
      throw timeout;
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
  }
}
export function eventId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const hex = Array.from(b, (n) => ("0" + n.toString(16)).slice(-2)).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

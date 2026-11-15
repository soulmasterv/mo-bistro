export function calledLabel(calledAt: string | null | undefined, now: number): string {
  if (!calledAt || !now) return "Called";
  const timestamp = Date.parse(calledAt);
  if (!Number.isFinite(timestamp)) return "Called";

  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  return minutes === 0 ? "Called just now" : `Called ${minutes} min ago`;
}

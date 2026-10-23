// This branch is the pilot; no environment switch can reveal the old platform.
export const PILOT_ORIGIN = "https://development.mo-bistro.labbing.space";
export const PILOT_JOB_PATH = "/api/pilot/jobs";
export const PILOT_STAFF_USERNAME = 'omarmohsen';
export function pilotPathAllowed(path: string) {
  if (path.startsWith("/api/")) return path.startsWith("/api/pilot/") ||
    ["/api/auth/login", "/api/auth/me", "/api/auth/logout", "/api/management/release-safety"].includes(path);
  return ["/", "/join", "/status", "/login"].includes(path) ||
    path.startsWith("/_next/") || /\.(?:ico|png|jpg|jpeg|svg|webp|woff2?)$/.test(path);
}

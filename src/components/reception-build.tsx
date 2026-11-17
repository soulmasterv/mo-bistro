import "server-only";
import ReceptionVersion from "./reception-version";

export default function ReceptionBuild({ environment }: { environment: "Development" | "Preview" }) {
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "Local";
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  return (
    <footer style={{ color: "#aaa59b", fontSize: 11, padding: "14px 20px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: "6px 14px" }}>
      <span>
      Version {version} · {process.env.VERCEL_ENV === "production" ? "Production" : environment}
      {branch ? ` · ${branch}` : ""}
      </span>
      <ReceptionVersion deployment={process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || process.env.VERCEL_GIT_COMMIT_SHA || "local"} endpoint="/api/pilot/version" />
    </footer>
  );
}

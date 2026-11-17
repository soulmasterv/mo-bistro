"use client";
import { useEffect, useState } from "react";

export default function ReceptionVersion({ deployment, endpoint }: { deployment: string; endpoint: string }) {
  const [status, setStatus] = useState<"checking" | "latest" | "update" | "unavailable">("checking");
  useEffect(() => {
    let active: AbortController | null = null;
    let stopped = false;
    async function check() {
      if (document.visibilityState !== "visible" || active) return;
      const controller = new AbortController();
      active = controller;
      const deadline = window.setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Version check failed");
        const data = await response.json();
        if (typeof data.deployment !== "string") throw new Error("Missing deployment");
        if (!stopped) setStatus(data.deployment === deployment ? "latest" : "update");
      } catch {
        if (!stopped) setStatus(current => current === "update" ? current : "unavailable");
      } finally {
        window.clearTimeout(deadline);
        active = null;
      }
    }
    const focus = () => { void check(); };
    const timer = window.setInterval(focus, 60000);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    void check();
    return () => {
      stopped = true;
      active?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [deployment, endpoint]);
  return <div style={{display:"inline-flex",alignItems:"center",gap:6}} role="status">
    {status === "latest" && <span aria-hidden="true" style={{width:7,height:7,borderRadius:"50%",background:"#36b873",flexShrink:0}} />}
    {status === "update" ? <>Update available · <button type="button" className="underline underline-offset-2" onClick={() => window.location.reload()}>Refresh</button></>
      : status === "latest" ? "Latest version" : status === "checking" ? "Checking version…" : "Couldn’t check version"}
  </div>;
}

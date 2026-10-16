"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, Bell, LogOut, UtensilsCrossed } from "lucide-react";
import type { StaffRole } from "@/lib/staff-session-shared";

import { ThemeSwitcher } from "@/components/theme-preference";
import StaffLicenseGuard from "@/components/staff-license-guard";

const workspaces = [
  { label: "Management", href: "/management" },
  { label: "Reception", href: "/" },
  { label: "Waiter", href: "/waiter" },
] as const;

export default function WorkspaceHeader({
  role,
  workspace,
  username,
}: {
  role: StaffRole;
  workspace: string;
  username?: string;
}) {
  const selector = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    let controller: AbortController | null = null;
    async function checkSession() {
      if (controller) return;
      const current = new AbortController(); controller = current;
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin", signal: current.signal });
        if (!current.signal.aborted && response.status === 401) window.location.replace("/login?reason=session-expired");
      } catch { /* A network failure must not sign staff out. */ }
      finally { if (controller === current) controller = null; }
    }
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void checkSession(); }, 60000);
    const focused = () => { if (document.visibilityState === "visible") void checkSession(); };
    window.addEventListener("focus", focused);
    document.addEventListener("visibilitychange", focused);
    return () => { controller?.abort(); window.clearInterval(timer); window.removeEventListener("focus", focused); document.removeEventListener("visibilitychange", focused); };
  }, []);
  useEffect(() => {
    function dismiss(event: PointerEvent | FocusEvent) {
      if (
        selector.current &&
        event.target instanceof Node &&
        !selector.current.contains(event.target)
      ) {
        selector.current.open = false;
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
    };
  }, []);
  useEffect(() => {
    function update(event: Event) {
      setPendingCount(Number((event as CustomEvent).detail) || 0);
    }
    window.addEventListener("mo-bistro-requests-changed", update);
    return () =>
      window.removeEventListener("mo-bistro-requests-changed", update);
  }, []);
  async function logout() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok)
        throw new Error("Unable to sign out. Please try again.");
      window.location.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign out.");
      setBusy(false);
    }
  }
  return (
    <header className="workspace-header bistro-workspace-header">
      <StaffLicenseGuard />
      <div className="workspace-header-inner bistro-header-inner">
        <div className="flex min-w-0 items-center gap-3">
          <UtensilsCrossed
            className="shrink-0 text-[#C5A77B]"
            size={22}
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold tracking-wide">Mo Bistro</p>
            <p className="bistro-header-subtitle">
              DISTRICT 5 <span>· {workspace}</span>
            </p>
          </div>
        </div>
        <div className="workspace-header-actions">
          {workspace === "Reception" && <div id="reception-header-tools" />}
          {workspace === "Reception" && pendingCount > 0 && (
            <button
              type="button"
              className="queue-request-bell"
              aria-label={`Open table requests (${pendingCount})`}
              onClick={() =>
                window.dispatchEvent(new Event("mo-bistro-open-requests"))
              }
            >
              <Bell size={20} />
              <span>{pendingCount}</span>
            </button>
          )}
          <details
            ref={selector}
            className="relative"
            onKeyDown={(event) => {
              if (event.key === "Escape" && selector.current) {
                selector.current.open = false;
                selector.current.querySelector("summary")?.focus();
              }
            }}
          >
            <summary
              className="workspace-switch queue-menu-trigger"
              aria-label="Open menu"
            >
              <Menu size={22} />
              <span className="workspace-account"><b>{username || "Staff"}</b><small>{role === "reception" ? "Receptionist" : role === "manager" ? "Manager" : "Waiter"}</small></span>
              <span className="sr-only">
                {role === "manager" ? "Switch Workspace" : "Menu"}
              </span>
            </summary>
            <nav aria-label="Workspace menu" className="workspace-menu">
              {role === "manager" && workspace !== "Workspaces" &&
                workspaces.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={workspace === item.label ? "page" : undefined}
                    onClick={() => {
                      if (selector.current) selector.current.open = false;
                    }}
                    className="workspace-option"
                  >
                    {item.label}
                  </Link>
                ))}
              <ThemeSwitcher />
              <button
                type="button"
                disabled={busy}
                onClick={() => void logout()}
                className="workspace-option queue-menu-signout"
              >
                <LogOut size={17} />
                {busy ? "Signing out…" : "Sign out"}
              </button>
            </nav>
          </details>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="mx-auto max-w-7xl px-4 pb-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}
    </header>
  );
}

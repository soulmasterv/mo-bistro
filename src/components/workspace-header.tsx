"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  UtensilsCrossed,
} from "lucide-react";
import type { StaffRole } from "@/lib/staff-session-shared";

const workspaces = [
  { label: "Management", href: "/management" },
  { label: "Reception", href: "/" },
  { label: "Waiter", href: "/waiter" },
] as const;

export default function WorkspaceHeader({
  role,
  workspace,
}: {
  role: StaffRole;
  workspace: string;
}) {
  const selector = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
        <div className="flex flex-wrap items-center gap-2">
          {role === "manager" && (
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
              <summary className="workspace-switch">
                <LayoutDashboard size={17} aria-hidden="true" />
                <span>Switch Workspace</span>
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <nav aria-label="Manager workspaces" className="workspace-menu">
                {workspaces.map((item) => (
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
              </nav>
            </details>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void logout()}
            className="workspace-signout bistro-signout"
            aria-label="Sign out"
          >
            <LogOut size={18} aria-hidden="true" />
            <span className="hidden sm:inline">
              {busy ? "Signing out…" : "Sign out"}
            </span>
          </button>
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

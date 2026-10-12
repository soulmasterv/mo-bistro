"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, Bell, LogOut, UtensilsCrossed } from "lucide-react";
import type { StaffRole } from "@/lib/staff-session-shared";

import { ThemeSwitcher } from "@/components/theme-preference";

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
  const [pendingCount, setPendingCount] = useState(0);
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
              <span className="sr-only">
                {role === "manager" ? "Switch Workspace" : "Menu"}
              </span>
            </summary>
            <nav aria-label="Workspace menu" className="workspace-menu">
              {role === "manager" &&
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

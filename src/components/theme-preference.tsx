"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

type Preference = "system" | "light" | "dark";
const KEY = "mo-bistro-theme";
let volatilePreference: Preference = "system";
const CHANGE = "mo-bistro-theme-change";
function preference(): Preference {
  try {
    const value = window.localStorage.getItem(KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    /* A storage restriction must not block the interface. */
  }
  return volatilePreference;
}
function snapshot() {
  const selected = preference();
  const theme =
    selected === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : selected;
  return selected + ":" + theme;
}
function subscribe(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE, callback);
  return () => {
    media.removeEventListener("change", callback);
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE, callback);
  };
}
function useTheme() {
  return useSyncExternalStore(subscribe, snapshot, () => "system:light");
}
export function ThemePreference() {
  const current = useTheme();
  const pathname = usePathname();
  useEffect(() => {
    // Keep the existing guest booking palette independent of staff preferences.
    document.documentElement.dataset.theme =
      pathname === "/join" ? "guest-light" : current.split(":")[1];
  }, [current, pathname]);
  return null;
}
export function ThemeSwitcher() {
  const current = useTheme();
  return (
    <label className="theme-switcher">
      <span>Theme</span>
      <select
        aria-label="Color theme"
        value={current.split(":")[0]}
        onChange={(event) => {
          const value = event.target.value as Preference;
          try {
            window.localStorage.setItem(KEY, value);
          } catch {
            volatilePreference = value;
          }
          document.documentElement.dataset.theme =
            value === "system"
              ? window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light"
              : value;
          window.dispatchEvent(new Event(CHANGE));
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}

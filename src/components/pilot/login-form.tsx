"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import styles from "./pilot.module.css";

export default function LoginForm({ children }: { children: ReactNode }) {
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const reset = () => {
      submitting.current = false;
      setBusy(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <form
      className={styles.form}
      method="post"
      action="/api/auth/login"
      aria-busy={busy}
      onSubmit={(event) => {
        if (submitting.current) {
          event.preventDefault();
          return;
        }
        submitting.current = true;
        setBusy(true);
      }}
    >
      {children}
      <button className={styles.button} type="submit" disabled={busy}>
        {busy ? (
          "Signing in…"
        ) : (
          <>
            Sign in <ArrowRight size={19} aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}

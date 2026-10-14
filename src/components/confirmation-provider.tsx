"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useStaffDialog } from "@/lib/use-staff-dialog";

type Confirmation = { title: string; message: string; confirmLabel?: string; destructive?: boolean };
type Confirm = (options: Confirmation) => Promise<boolean>;
const ConfirmationContext = createContext<Confirm | null>(null);

function ConfirmationDialog({ options, onDecision }: { options: Confirmation; onDecision: (confirmed: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useStaffDialog(true, ref, () => onDecision(false));
  return createPortal(
    <div className="confirmation-overlay" onClick={event => {
      if (event.target === event.currentTarget) onDecision(false);
    }}>
      <div ref={ref} className="confirmation-card" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} tabIndex={-1}>
        <p className="confirmation-brand">MO BISTRO</p>
        <h2 id={`${id}-title`}>{options.title}</h2>
        <p id={`${id}-description`}>{options.message}</p>
        <div className="confirmation-actions">
          <button type="button" onClick={() => onDecision(false)}>Cancel</button>
          <button type="button" className={options.destructive ? "confirmation-destructive" : "confirmation-primary"} onClick={() => onDecision(true)}>{options.confirmLabel || "Confirm"}</button>
        </div>
      </div>
    </div>, document.body,
  );
}

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<Confirmation | null>(null);
  const pending = useRef<((value: boolean) => void) | null>(null);
  const confirm = useCallback<Confirm>(next => new Promise(resolve => {
    // A second action never replaces or implicitly confirms the pending action.
    if (pending.current) { resolve(false); return; }
    pending.current = resolve;
    setOptions(next);
  }), []);
  const finish = useCallback((confirmed: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setOptions(null);
    resolve?.(confirmed);
  }, []);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  return <ConfirmationContext.Provider value={confirm}>{children}{options && <ConfirmationDialog options={options} onDecision={finish} />}</ConfirmationContext.Provider>;
}

export function useConfirmation() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error("ConfirmationProvider is required");
  return confirm;
}

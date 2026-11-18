"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { useStaffDialog } from "@/lib/use-staff-dialog";

export default function RegistrationQrDialog({ onClose }: { onClose: () => void }) {
  const qrDialog = useRef<HTMLDivElement>(null);
  useStaffDialog(true, qrDialog, onClose);
  const [registrationUrl, setRegistrationUrl] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    let controller: AbortController | null = null;
    async function refresh() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const response = await fetch("/api/qr", { cache: "no-store", signal: current.signal });
        if (!response.ok) throw new Error("Unable to load QR code");
        const data = await response.json();
        if (!current.signal.aborted) setRegistrationUrl(typeof data.url === "string" ? data.url : "");
      } catch {
        if (!current.signal.aborted) setRegistrationUrl("");
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => {
      window.clearInterval(timer);
      controller?.abort();
    };
  }, []);

  return createPortal(
    <div
      ref={qrDialog}
      tabIndex={-1}
      role="dialog"
      aria-labelledby="qr-heading"
      aria-describedby="qr-instructions"
      aria-modal="true"
      aria-label="Guest registration QR code"
      className="bistro-dialog-scope bistro-qr-overlay fixed inset-0 z-[9999] flex h-[100dvh] w-full items-center justify-center overflow-y-auto bg-black/80 p-4 text-white"
    >
      <div className="bistro-qr-card my-auto w-full max-w-md rounded-3xl border border-white/10 bg-[#17202A] p-5 text-center shadow-2xl sm:p-7">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#C5A77B]">
          Welcome to the table
        </p>
        <h2
          id="qr-heading"
          className="text-3xl font-semibold tracking-tight"
        >
          Mo Bistro
        </h2>
        <p id="qr-instructions" className="mt-2 text-sm text-slate-400">
          Scan this QR code to join the waitlist.
        </p>

        <div className="mx-auto my-6 w-fit max-w-full rounded-2xl bg-white p-4 sm:p-6">
          {registrationUrl ? (
            <QRCodeSVG
              value={registrationUrl}
              size={220}
              level="M"
              marginSize={4}
              title="Mo Bistro waitlist QR code"
              className="h-auto max-w-full"
            />
          ) : (
            <div className="flex h-[220px] w-[220px] items-center justify-center text-center text-sm text-slate-600">
              Loading QR code... If it does not appear, close and reopen.
            </div>
          )}
        </div>

        <label className="block text-xs text-slate-400">Registration link
          <input aria-label="Registration link" readOnly value={registrationUrl} onFocus={event => event.currentTarget.select()} className="mt-2 w-full rounded-lg border border-white/20 bg-transparent p-3" />
        </label>
        {copyMessage && <p role="status" className="mt-2 text-xs">{copyMessage}</p>}

        <div className="mt-6 flex gap-3">
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(registrationUrl);
                setCopyMessage("Registration link copied.");
              } catch {
                setCopyMessage("Automatic copying is unavailable. Select and copy the registration link above.");
              }
            }}
            disabled={!registrationUrl}
            className="flex-1 rounded-xl border border-white/20 p-3 text-sm hover:bg-white/10 disabled:opacity-40"
          >
            Copy link
          </button>
          <button
            onClick={() => onClose()}
            className="flex-1 rounded-xl bg-[#C5A77B] p-3 text-sm font-semibold text-[#101820] hover:bg-[#D8BC91]"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

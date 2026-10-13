"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { useStaffDialog } from "@/lib/use-staff-dialog";
export default function TrackingHandoff({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  useStaffDialog(true, ref, onClose);
  return createPortal(
    <div className="bistro-dialog-scope queue-sheet-overlay">
      <div
        ref={ref}
        className="queue-guest-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracking-handoff-title"
        tabIndex={-1}
      >
        <header>
          <h2 id="tracking-handoff-title">Guest tracking link</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tracking link"
          >
            ×
          </button>
        </header>
        <p className="my-4 text-sm">
          Ask this guest to scan the code to follow their booking. Share this
          private link only with them. WhatsApp updates remain their choice.
        </p>
        <div className="flex justify-center rounded-xl bg-white p-5">
          <QRCodeSVG value={url} size={200} />
        </div>
        <button
          type="button"
          className="bistro-button mt-5 w-full"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setMessage("Private link copied.");
            } catch {
              setMessage(
                "Copy is unavailable. Ask the guest to scan the code.",
              );
            }
          }}
        >
          Copy private link
        </button>
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      </div>
    </div>,
    document.body,
  );
}

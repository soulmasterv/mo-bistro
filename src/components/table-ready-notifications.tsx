"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, X } from "lucide-react";

type Table = {
  id: number;
  name: string;
  seats: number;
  area: string;
  status: string;
};

type Notice = {
  id: number;
  name: string;
  seats: number;
  area: string;
};

export default function TableReadyNotifications() {
  const previous = useRef<Map<number, Table> | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    let active = true;
    let running = false;

    async function checkTables() {
      if (running) return;
      running = true;

      try {
        const response = await fetch("/api/tables", {
          cache: "no-store",
          credentials: "same-origin",
        });

        if (!response.ok) return;

        const data: unknown = await response.json();
        const record =
          data && typeof data === "object"
            ? (data as Record<string, unknown>)
            : {};

        const raw = Array.isArray(data)
          ? data
          : Array.isArray(record.tables)
            ? record.tables
            : Array.isArray(record.data)
              ? record.data
              : null;

        if (!raw || !active) return;

        const tables: Table[] = raw.map((item: Record<string, unknown>) => ({
          id: Number(item.id),
          name: String(item.name ?? `Table ${item.id}`),
          seats: Number(item.seats ?? 0),
          area: String(item.area ?? "indoor"),
          status: String(item.status ?? "free").toLowerCase(),
        }));

        const next = new Map(tables.map((table) => [table.id, table]));

        if (previous.current) {
          const newlyReady = tables.filter((table) => {
            const old = previous.current?.get(table.id);
            return old?.status === "occupied" && table.status === "free";
          });

          if (newlyReady.length > 0) {
            setNotices((current) =>
              [
                ...newlyReady.map((table) => ({
                  id: table.id,
                  name: table.name,
                  seats: table.seats,
                  area: table.area,
                })),
                ...current,
              ].slice(0, 5)
            );
          }
        }

        previous.current = next;
      } catch {
        // Retry automatically on the next polling interval.
      } finally {
        running = false;
      }
    }

    void checkTables();

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void checkTables();
      }
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (notices.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-[110] flex flex-col gap-3 sm:left-auto sm:right-6 sm:w-96"
    >
      {notices.map((notice) => (
        <div
          key={notice.id}
          role="status"
          className="rounded-2xl border border-[#6B745E] bg-[#30362B] p-4 text-[#FFFCF7] shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <BellRing
              size={22}
              className="mt-1 shrink-0 text-[#D6B681]"
            />

            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {notice.name} is ready!
              </p>

              <p className="mt-1 text-sm text-[#E0DCCD]">
                {notice.area} · {notice.seats} seats
              </p>

              <p className="mt-2 text-xs text-[#C8CDBF]">
                A table is available for the next guests.
              </p>
            </div>

            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() =>
                setNotices((current) =>
                  current.filter((item) => item.id !== notice.id)
                )
              }
              className="rounded-lg p-2 text-[#E0DCCD]"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

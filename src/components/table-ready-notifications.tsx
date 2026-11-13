"use client";
import {receptionRead,watchReception} from "@/lib/reception-feed";


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
        const response = await receptionRead("/api/tables", {
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
              ].slice(0, 5),
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

    const unsubscribe=watchReception(()=>void checkTables());
    return () => { active=false;unsubscribe(); };
  }, []);

  if (notices.length === 0) return null;

  return (
    <div aria-live="polite" className="bistro-table-notices">
      {notices.map((notice) => (
        <div key={notice.id} role="status" className="bistro-table-notice">
          <div className="flex items-start gap-3">
            <BellRing size={22} className="mt-1 shrink-0" />

            <div className="min-w-0 flex-1">
              <p className="font-semibold">{notice.name} is ready!</p>

              <p className="mt-1 text-sm">
                {notice.area} · {notice.seats} seats
              </p>

              <p className="mt-2 text-xs">
                A table is available for the next guests.
              </p>
            </div>

            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() =>
                setNotices((current) =>
                  current.filter((item) => item.id !== notice.id),
                )
              }
              className="rounded-lg p-2"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

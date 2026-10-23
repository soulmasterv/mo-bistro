"use client";

import { useEffect, useState } from "react";

function formatWait(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (!hours) return `${remaining} mins`;

  return `${hours} ${hours === 1 ? "hour" : "hours"}${
    remaining ? ` ${remaining} mins` : ""
  }`;
}

export default function RestaurantWaitDisplay({ etaAt }: { etaAt?: string | null } = {}) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const timestamp = etaAt ? Date.parse(etaAt) : NaN;
  const personal = Number.isFinite(timestamp);

  useEffect(() => {
    if (personal) return;
    let active = true;

    async function refresh() {
      try {
        const response = await fetch("/api/wait-estimate", {
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = await response.json();

        if (active && typeof data.minutes === "number") {
          setMinutes(data.minutes);
        }
      } catch {
        // Keep the last known estimate if temporarily offline.
      }
    }

    void refresh();

    const timer = window.setInterval(() => void refresh(), 15000);
    window.addEventListener("mo-bistro-wait-changed", refresh);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("mo-bistro-wait-changed", refresh);
    };
  }, [personal]);

  if (!personal && minutes === null) return null;

  return (
    <div className="mb-6 rounded-2xl border border-[#D9C49E]/50 bg-[#F4F0E7] p-5 text-[#302D28]">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#8D724C]">
        {personal ? "Expected table readiness" : "Current estimated wait"}
      </p>

      <p className="mt-2 font-serif text-3xl">
        {personal ? new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : formatWait(minutes!)}
      </p>

      <p className="mt-2 text-xs text-[#807B71]">
        {personal ? "An estimate for your booking. Reception will confirm when your table is ready." : "Approximate restaurant-wide wait. Actual seating times may vary."}
      </p>
    </div>
  );
}

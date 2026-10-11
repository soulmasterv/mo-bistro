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

export default function RestaurantWaitDisplay() {
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
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

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (minutes === null) return null;

  return (
    <div className="mb-6 rounded-2xl border border-[#D9C49E]/50 bg-[#F4F0E7] p-5 text-[#302D28]">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#8D724C]">
        Current estimated wait
      </p>

      <p className="mt-2 font-serif text-3xl">
        {formatWait(minutes)}
      </p>

      <p className="mt-2 text-xs text-[#807B71]">
        Approximate restaurant-wide wait. Actual seating times may vary.
      </p>
    </div>
  );
}

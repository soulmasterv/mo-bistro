"use client";

import { useState } from "react";

export default function DebugPage() {
  const [clicks, setClicks] = useState(0);

  return (
    <main style={{ padding: 40, background: "white", color: "black", minHeight: "100vh" }}>
      <h1>React Hydration Test</h1>

      <p>Clicks: {clicks}</p>

      <button
        type="button"
        onClick={() => setClicks((previous) => previous + 1)}
        style={{
          background: "green",
          color: "white",
          padding: 20,
          cursor: "pointer",
          borderRadius: 8,
        }}
      >
        CLICK ME
      </button>
    </main>
  );
}

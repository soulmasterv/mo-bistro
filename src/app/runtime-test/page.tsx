"use client";

import { useEffect, useState } from "react";

export default function RuntimeTest() {
  const [count, setCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = window.setTimeout(() => setMounted(true), 0);
    console.log("REACT MOUNTED SUCCESSFULLY");
    return () => window.clearTimeout(initial);
  }, []);

  return (
    <main style={{ padding: 40, background: "white", color: "black" }}>
      <h1>React Runtime Diagnostic</h1>

      <p id="mount-status">
        Mounted: {mounted ? "YES" : "NO"}
      </p>

      <p>Count: {count}</p>

      <button
        id="test-button"
        onClick={() => setCount(c => c + 1)}
        style={{
          padding: 20,
          background: "green",
          color: "white"
        }}
      >
        Increase Counter
      </button>
    </main>
  );
}

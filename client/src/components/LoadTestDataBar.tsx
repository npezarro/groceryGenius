// client/src/components/LoadTestDataBar.tsx
import { useEffect, useState } from "react";

type Stats = { storeCount: number; itemCount: number; priceCount: number };
type SeedResult = { ok: boolean; seeded?: boolean; before?: { storeCount: number; itemCount: number; priceCount: number }; after?: Stats; error?: string };

export default function LoadTestDataBar() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [stats, setStats] = useState<Stats | null>(null);

  async function refreshStats() {
    try {
      const r = await fetch("/api/diag/stats");
      const j = await r.json();
      if (j.ok && j.stats) setStats(j.stats as Stats);
    } catch {
      // no-op
    }
  }

  useEffect(() => { refreshStats(); }, []);

  async function onSeedNow() {
    setLoading(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin/seed-now", {
        method: "POST"
      });
      const j: SeedResult = await r.json();
      if (!j.ok) {
        setMessage(j.error || "Seed failed");
      } else {
        setMessage(j.seeded ? "Test data loaded." : "Database already populated.");
        if (j.after) setStats(j.after);
      }
    } catch {
      setMessage("Network error.");
    } finally {
      setLoading(false);
    }
  }

  // Stick to bottom; minimal neutral styling
  return (
    <div style={{
      position: "fixed",
      left: 0, right: 0, bottom: 0,
      display: "flex",
      gap: "8px",
      alignItems: "center",
      padding: "10px 12px",
      borderTop: "1px solid rgba(0,0,0,0.1)",
      background: "rgba(255,255,255,0.95)",
      backdropFilter: "saturate(180%) blur(6px)",
      zIndex: 1000
    }}>
      <strong>Admin:</strong>
      <button
        onClick={onSeedNow}
        disabled={loading}
        style={{
          padding: "8px 12px",
          border: "1px solid #333",
          borderRadius: 8,
          background: loading ? "#f5f5f5" : "#fff",
          cursor: loading ? "not-allowed" : "pointer",
          fontWeight: 600
        }}
        aria-busy={loading}
        data-testid="button-load-test-data"
      >
        {loading ? "Loading…" : "Load Test Data"}
      </button>
      <div style={{ marginLeft: "auto", fontSize: 12, color: "#333" }} data-testid="text-stats">
        {stats ? `Stores: ${stats.storeCount} • Items: ${stats.itemCount} • Prices: ${stats.priceCount}` : "—"}
        {message ? `  —  ${message}` : ""}
      </div>
    </div>
  );
}
// client/src/components/LoadTestDataBar.tsx
import { useEffect, useState } from "react";
type Stats = { storeCount: number; itemCount: number; priceCount: number };

async function callSeed(mode: "stores"|"items"|"prices"|"all") {
  const r = await fetch(`/api/admin/seed?mode=${mode}`, { method: "POST" });
  return r.json();
}

export default function LoadTestDataBar() {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [stats, setStats] = useState<Stats | null>(null);

  async function refreshStats() {
    const r = await fetch("/api/diag/stats");
    const j = await r.json();
    if (j.ok) setStats(j.stats);
  }
  useEffect(() => { refreshStats(); }, []);

  async function onClick(mode: "stores"|"items"|"prices"|"all") {
    setLoading(mode); setMessage("");
    try {
      const j = await callSeed(mode);
      if (j.ok === false) {
        setMessage(j.error || "Seed failed");
      } else {
        setMessage(j.message || "Done.");
      }
      await refreshStats();
    } catch {
      setMessage("Network error.");
    } finally {
      setLoading(null);
    }
  }

  const btnStyle: React.CSSProperties = { padding: "8px 10px", border: "1px solid #333", borderRadius: 8, background: "#fff", fontWeight: 600 };

  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", borderTop: "1px solid rgba(0,0,0,0.1)", background: "rgba(255,255,255,0.95)", backdropFilter: "saturate(180%) blur(6px)", zIndex: 1000 }}>
      <strong>Load Test Data:</strong>
      <button onClick={() => onClick("stores")} disabled={loading !== null} style={btnStyle} data-testid="button-load-stores">{loading==="stores"?"…" :"Load Stores"}</button>
      <button onClick={() => onClick("items")}  disabled={loading !== null} style={btnStyle} data-testid="button-load-items">{loading==="items" ?"…" :"Load Items"}</button>
      <button onClick={() => onClick("prices")} disabled={loading !== null} style={btnStyle} data-testid="button-load-prices">{loading==="prices"?"…" :"Load Prices"}</button>
      <button onClick={() => onClick("all")}    disabled={loading !== null} style={btnStyle} data-testid="button-load-all">{loading==="all"   ?"…" :"Load All"}</button>
      <div style={{ marginLeft: "auto", fontSize: 12 }} data-testid="text-stats">
        {stats ? `Stores: ${stats.storeCount} • Items: ${stats.itemCount} • Prices: ${stats.priceCount}` : "—"}
        {message ? `  —  ${message}` : ""}
      </div>
    </div>
  );
}
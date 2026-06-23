import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Store as StoreIcon, MapPin, ChevronDown, ChevronRight, Receipt } from "lucide-react";
import { apiUrl } from "@/lib/api";
import type { LocationCoordinates } from "@/lib/types";

interface DataPointItem {
  name: string;
  price: number;
  discount?: number;
  originalPrice?: number;
}
interface DataPoint {
  date: string | null;
  location: string | null;
  total: number | null;
  items: DataPointItem[];
}
interface DirEntry {
  store: { id: string; name: string; address: string | null; lat: number | null; lng: number | null; distance?: number };
  coverage: number;
  reportCount: number;
  dataPoints: DataPoint[];
}

function fmtDate(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "" : dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function StoreCard({ entry }: { entry: DirEntry }) {
  const [open, setOpen] = useState(false);
  const { store, coverage, reportCount, dataPoints } = entry;
  return (
    <div className="rounded-2xl border border-border bg-background" data-testid="directory-store">
      <button
        className="w-full flex items-center justify-between gap-3 p-3 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium truncate flex items-center gap-1.5">
            <StoreIcon size={14} className="shrink-0 text-[#2f5d4d]" /> {store.name}
          </p>
          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
            {store.address ? <><MapPin size={11} /> {store.address}</> : null}
            {store.distance != null ? <span className="ml-1">· {store.distance.toFixed(1)} mi</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{coverage} priced</p>
            {reportCount > 0 ? (
              <p className="text-xs font-medium text-[#2f5d4d] flex items-center gap-1 justify-end">
                <Receipt size={11} /> {reportCount} receipt{reportCount > 1 ? "s" : ""}
              </p>
            ) : <p className="text-[10px] text-muted-foreground">no receipts yet</p>}
          </div>
          {reportCount > 0 ? (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="w-4" />}
        </div>
      </button>

      {open && reportCount > 0 && (
        <div className="border-t border-border px-3 py-2 space-y-3">
          {dataPoints.map((dp, i) => (
            <div key={i} className="text-xs" data-testid="directory-datapoint">
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span>{fmtDate(dp.date)}{dp.location ? ` · ${dp.location}` : ""}</span>
                {dp.total != null ? <span>total ${dp.total.toFixed(2)}</span> : null}
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                {dp.items.map((it, j) => (
                  <li key={j} className="flex items-center justify-between gap-2">
                    <span className="truncate">{it.name}</span>
                    <span className="shrink-0">
                      ${it.price.toFixed(2)}
                      {it.discount ? <span className="text-[#2f5d4d]"> (-${it.discount.toFixed(2)})</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Browsable store directory with anonymized community receipt data per store. */
export default function StoreDirectory({ coordinates }: { coordinates: LocationCoordinates | null }) {
  const qs = coordinates ? `?lat=${coordinates.lat}&lng=${coordinates.lng}&radius=10` : "";
  const { data, isLoading } = useQuery({
    queryKey: ["/api/store-directory", coordinates?.lat, coordinates?.lng],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/store-directory${qs}`));
      if (!res.ok) throw new Error("Failed to load directory");
      return (await res.json()) as { stores: DirEntry[] };
    },
    staleTime: 5 * 60 * 1000,
  });

  const stores = (data?.stores ?? []).filter((e) => e.reportCount > 0 || e.coverage > 0);
  const withReceipts = stores.filter((e) => e.reportCount > 0).length;

  return (
    <div className="rounded-3xl border border-border bg-card/95 p-5 shadow-sm" data-testid="store-directory">
      <div className="flex items-center gap-2 mb-1">
        <StoreIcon size={18} className="text-[#2f5d4d]" />
        <h3 className="text-lg font-serif">Store directory</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Nearby stores with community-reported receipt data (anonymized).{" "}
        {withReceipts > 0 ? `${withReceipts} with receipts so far. ` : ""}
        Upload your receipts to fill in prices and unlock comparisons.
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading stores...</p>
      ) : stores.length === 0 ? (
        <p className="text-sm text-muted-foreground">No store data yet. Upload a receipt to get started.</p>
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {stores.slice(0, 40).map((e) => <StoreCard key={e.store.id} entry={e} />)}
        </div>
      )}
    </div>
  );
}

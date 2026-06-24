import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Store as StoreIcon, MapPin, ChevronLeft, Clock, Users } from "lucide-react";
import { apiUrl } from "@/lib/api";

interface Location {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  coverage: number;
  reports: number;
}
interface SearchGroup {
  name: string;
  locations: Location[];
  totalCoverage: number;
  totalReports: number;
}
interface StoreItem {
  name: string;
  unit: string | null;
  latestPrice: number | null;
  lastReported: string | null;
  reportCount: number;
}

function relTime(d: string | null): string {
  if (!d) return "";
  const t = new Date(d).getTime();
  if (isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function StorePrices({ store, onBack }: { store: Location; onBack: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: [`/api/stores/${store.id}/prices`],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/stores/${store.id}/prices`));
      if (!res.ok) throw new Error("Failed to load prices");
      return (await res.json()) as { items: StoreItem[] };
    },
    staleTime: 60 * 1000,
  });
  const items = data?.items ?? [];

  return (
    <div data-testid="store-prices">
      <button className="text-sm text-muted-foreground flex items-center gap-1 mb-3 hover:text-foreground" onClick={onBack}>
        <ChevronLeft size={14} /> Back to search
      </button>
      <div className="mb-3">
        <p className="text-base font-medium flex items-center gap-1.5"><StoreIcon size={15} className="text-[#2f5d4d]" /> {store.name}</p>
        {store.address ? <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin size={11} /> {store.address}</p> : null}
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading prices...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No price data reported here yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">Item</th>
                <th className="text-right font-medium px-3 py-2">Latest</th>
                <th className="text-right font-medium px-3 py-2 hidden sm:table-cell"><Clock size={11} className="inline" /> Updated</th>
                <th className="text-right font-medium px-3 py-2"><Users size={11} className="inline" /></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-border" data-testid="store-price-row">
                  <td className="px-3 py-1.5">{it.name}{it.unit ? <span className="text-muted-foreground text-xs"> /{it.unit}</span> : null}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{it.latestPrice != null ? `$${it.latestPrice.toFixed(2)}` : "—"}</td>
                  <td className="px-3 py-1.5 text-right text-xs text-muted-foreground hidden sm:table-cell">{relTime(it.lastReported)}</td>
                  <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">{it.reportCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Searchable price directory: fuzzy store name -> location -> per-item prices. */
export default function PriceDirectory() {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 300);
  const [group, setGroup] = useState<SearchGroup | null>(null);
  const [selected, setSelected] = useState<Location | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/stores/search", debounced],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/stores/search?q=${encodeURIComponent(debounced)}`));
      if (!res.ok) throw new Error("Search failed");
      return (await res.json()) as { results: SearchGroup[] };
    },
    staleTime: 60 * 1000,
  });
  const results = data?.results ?? [];

  return (
    <div className="rounded-3xl border border-border bg-card/95 p-5 shadow-sm" data-testid="price-directory">
      <div className="flex items-center gap-2 mb-1">
        <StoreIcon size={18} className="text-[#2f5d4d]" />
        <h3 className="text-lg font-serif">Price directory</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Search any store or restaurant to see reported prices, when each was last updated, and how many reports back it.</p>

      {selected ? (
        <StorePrices store={selected} onBack={() => setSelected(null)} />
      ) : group ? (
        <div>
          <button className="text-sm text-muted-foreground flex items-center gap-1 mb-3 hover:text-foreground" onClick={() => setGroup(null)}>
            <ChevronLeft size={14} /> Back
          </button>
          <p className="text-base font-medium mb-2">{group.name} — choose a location</p>
          <div className="space-y-2">
            {group.locations.map((loc) => (
              <button key={loc.id} className="w-full text-left rounded-xl border border-border bg-background p-3 hover:bg-muted/50" onClick={() => setSelected(loc)}>
                <p className="text-sm flex items-center gap-1"><MapPin size={12} /> {loc.address || "Location"}</p>
                <p className="text-xs text-muted-foreground">{loc.coverage} priced items · {loc.reports} receipt{loc.reports === 1 ? "" : "s"}</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-2.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a store or restaurant..."
              className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-sm"
              data-testid="price-directory-search"
            />
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Searching...</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground">{debounced ? "No matching stores." : "No stores yet."}</p>
          ) : (
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {results.map((g, i) => (
                <button
                  key={i}
                  className="w-full text-left rounded-xl border border-border bg-background p-3 hover:bg-muted/50 flex items-center justify-between gap-2"
                  onClick={() => (g.locations.length === 1 ? setSelected(g.locations[0]) : setGroup(g))}
                  data-testid="price-directory-result"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{g.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.locations.length > 1 ? `${g.locations.length} locations · ` : ""}
                      {g.totalCoverage} priced items{g.totalReports ? ` · ${g.totalReports} receipt${g.totalReports === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                  <ChevronLeft size={16} className="rotate-180 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

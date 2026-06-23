import { useQuery } from "@tanstack/react-query";
import { Tag } from "lucide-react";
import { apiUrl } from "@/lib/api";

interface Deal {
  item: string;
  store: string;
  price: number;
  originalPrice?: number;
  savings: number;
  promotionText?: string;
}

/** Active promotions ranked by savings, with an AI-written shopper summary. */
export default function Deals() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/ai/deals"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/ai/deals"));
      if (!res.ok) throw new Error("Failed to load deals");
      return (await res.json()) as { deals: Deal[]; summary?: string };
    },
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-card/95 p-5 shadow-sm min-h-[120px] flex items-center justify-center">
        <span className="text-muted-foreground text-sm">Finding deals...</span>
      </div>
    );
  }

  const deals = data?.deals ?? [];
  if (deals.length === 0) return null;

  return (
    <div className="rounded-3xl border border-border bg-card/95 p-5 shadow-sm" data-testid="deals">
      <div className="flex items-center gap-2 mb-3">
        <Tag size={18} className="text-[#2f5d4d]" />
        <h3 className="text-lg font-serif">Deals near you</h3>
      </div>
      {data?.summary && (
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{data.summary}</p>
      )}
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {deals.map((d, i) => (
          <li key={i} className="rounded-xl border border-border bg-background px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{d.item}</p>
              <p className="text-xs text-muted-foreground truncate">{d.store}{d.promotionText ? ` · ${d.promotionText}` : ""}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold">${d.price.toFixed(2)}</p>
              {d.originalPrice ? (
                <p className="text-xs text-muted-foreground line-through">${d.originalPrice.toFixed(2)}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

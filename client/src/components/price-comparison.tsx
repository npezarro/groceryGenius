import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Tag } from "lucide-react";

interface PriceComparisonProps {
  itemId: string;
  itemName: string;
}

interface StorePrice {
  storeId: string;
  storeName: string;
  storeAddress: string;
  price: string;
  unit: string | null;
  isPromotion: boolean | null;
  originalPrice: string | null;
  memberPrice: string | null;
  capturedAt: string;
}

function shortStoreName(name: string): string {
  return name.replace(/\s*[—–-]\s*.+$/, "").trim();
}

function formatUnit(unit?: string | null): string {
  if (!unit) return "";
  return `/${unit.replace(/^1\s+/, "").trim()}`;
}

export default function PriceComparison({ itemId, itemName }: PriceComparisonProps) {
  const { data: prices, isLoading } = useQuery<StorePrice[]>({
    queryKey: ["/api/prices/compare", itemId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/prices/compare/${itemId}`));
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!itemId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 mt-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!prices || prices.length === 0) {
    return (
      <p className="text-xs text-muted-foreground mt-2">No store prices found for {itemName}</p>
    );
  }

  const cheapest = parseFloat(prices[0].price);

  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-medium text-muted-foreground mb-1">
        Prices across {prices.length} store{prices.length > 1 ? "s" : ""}
      </p>
      {prices.map((sp, i) => {
        const price = parseFloat(sp.price);
        const isCheapest = i === 0 && prices.length > 1;
        const savings = price - cheapest;

        return (
          <div
            key={sp.storeId}
            className={`flex items-center justify-between rounded px-2 py-1.5 text-xs ${
              isCheapest ? "bg-green-50 border border-green-200" : "bg-muted/50"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{shortStoreName(sp.storeName)}</div>
              {sp.storeAddress && !sp.storeAddress.match(/^\d{5}\s*area$/i) && (
                <div className="text-muted-foreground truncate flex items-center gap-0.5">
                  <MapPin size={8} /> {sp.storeAddress}
                </div>
              )}
            </div>
            <div className="text-right ml-2 shrink-0">
              <span className={`font-semibold ${isCheapest ? "text-green-700" : ""}`}>
                ${price.toFixed(2)}{formatUnit(sp.unit)}
              </span>
              {sp.isPromotion && (
                <span className="ml-1">
                  <Tag size={10} className="inline text-amber-500" />
                </span>
              )}
              {savings > 0.01 && (
                <div className="text-muted-foreground">+${savings.toFixed(2)}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

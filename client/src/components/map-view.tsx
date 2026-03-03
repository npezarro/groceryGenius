import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Map, Plus, Minus } from "lucide-react";
import { LocationCoordinates } from "@/lib/types";

interface MapViewProps {
  coordinates: LocationCoordinates | null;
  stores: any[];
  radius: number;
}

export default function MapView({ coordinates, stores, radius }: MapViewProps) {
  const storesWithCoords = stores.filter(store => store.lat && store.lng);
  const avgDistance = storesWithCoords.length > 0 
    ? (storesWithCoords.reduce((sum, store) => {
        if (!coordinates) return sum;
        const dist = Math.sqrt(
          Math.pow(coordinates.lat - store.lat, 2) + 
          Math.pow(coordinates.lng - store.lng, 2)
        ) * 69; // Rough conversion to miles
        return sum + dist;
      }, 0) / storesWithCoords.length).toFixed(1)
    : '0.0';

  return (
    <Card className="shadow-sm border-0 shadow-md">
      <CardContent className="p-5">
        <h2 className="text-base font-semibold mb-4 flex items-center">
          <div className="bg-primary/10 rounded-lg p-1.5 mr-2.5">
            <Map className="text-primary" size={18} />
          </div>
          Store Locations
        </h2>

        <div className="relative h-64 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950/30 dark:via-teal-950/30 dark:to-cyan-950/30 rounded-xl border border-border overflow-hidden">
          {/* Mock Map Interface */}
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <div className="bg-white/60 dark:bg-black/40 rounded-2xl p-5 backdrop-blur-sm">
                <Map size={40} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium text-foreground/70">Map View</p>
                <p className="text-xs mt-1 text-muted-foreground">Store locations will appear here</p>
                {coordinates && (
                  <p className="text-xs mt-2 bg-primary/10 text-primary rounded-full px-3 py-1 font-medium">
                    {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Map Controls */}
          <div className="absolute top-3 right-3 flex flex-col gap-1">
            <Button size="sm" variant="outline" className="h-7 w-7 p-0 bg-white/90 hover:bg-white shadow-sm rounded-md">
              <Plus size={12} />
            </Button>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0 bg-white/90 hover:bg-white shadow-sm rounded-md">
              <Minus size={12} />
            </Button>
          </div>
        </div>

        {/* Store Summary */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div className="p-3 bg-primary/5 rounded-xl border border-primary/10">
            <div className="text-lg font-bold text-primary" data-testid="store-count">
              {storesWithCoords.length}
            </div>
            <div className="text-xs text-muted-foreground font-medium">Stores</div>
          </div>
          <div className="p-3 bg-secondary/5 rounded-xl border border-secondary/10">
            <div className="text-lg font-bold text-secondary" data-testid="avg-distance">
              {avgDistance} mi
            </div>
            <div className="text-xs text-muted-foreground font-medium">Avg Distance</div>
          </div>
          <div className="p-3 bg-accent/5 rounded-xl border border-accent/10">
            <div className="text-lg font-bold text-accent" data-testid="coverage">
              --
            </div>
            <div className="text-xs text-muted-foreground font-medium">Coverage</div>
          </div>
          <div className="p-3 bg-muted rounded-xl border border-border">
            <div className="text-lg font-bold text-foreground" data-testid="estimated-savings">
              --
            </div>
            <div className="text-xs text-muted-foreground font-medium">Savings</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

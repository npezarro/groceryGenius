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
    <Card className="shadow-sm">
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <Map className="text-primary mr-2" size={20} />
          Store Locations
        </h2>
        
        <div className="relative h-80 bg-gradient-to-br from-[#f3efe6] to-[#c9d6df] rounded-lg border border-border overflow-hidden">
          {/* Mock Map Interface */}
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Map size={64} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Interactive Map with Store Locations</p>
              <p className="text-xs mt-1">Powered by Mapbox</p>
              {coordinates && (
                <p className="text-xs mt-2 bg-white/80 rounded px-2 py-1">
                  Center: {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
                </p>
              )}
            </div>
          </div>
          
          {/* Map Controls */}
          <div className="absolute top-4 right-4 space-y-2">
            <Button size="sm" variant="outline" className="h-8 w-8 p-0 bg-white/90 hover:bg-white">
              <Plus size={14} />
            </Button>
            <Button size="sm" variant="outline" className="h-8 w-8 p-0 bg-white/90 hover:bg-white">
              <Minus size={14} />
            </Button>
          </div>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-white/95 border border-border rounded p-3 shadow-sm">
            <div className="space-y-1 text-xs">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-primary rounded-full mr-2"></div>
                <span>Your Location</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-secondary rounded-full mr-2"></div>
                <span>Grocery Stores</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-accent rounded-full mr-2"></div>
                <span>Selected Route</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Store Summary */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="p-3 bg-muted rounded-md">
            <div className="text-lg font-semibold text-primary" data-testid="store-count">
              {storesWithCoords.length}
            </div>
            <div className="text-xs text-muted-foreground">Stores Found</div>
          </div>
          <div className="p-3 bg-muted rounded-md">
            <div className="text-lg font-semibold text-secondary" data-testid="avg-distance">
              {avgDistance} mi
            </div>
            <div className="text-xs text-muted-foreground">Avg Distance</div>
          </div>
          <div className="p-3 bg-muted rounded-md">
            <div className="text-lg font-semibold text-accent" data-testid="coverage">
              --
            </div>
            <div className="text-xs text-muted-foreground">Item Coverage</div>
          </div>
          <div className="p-3 bg-muted rounded-md">
            <div className="text-lg font-semibold text-foreground" data-testid="estimated-savings">
              --
            </div>
            <div className="text-xs text-muted-foreground">Est. Savings</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

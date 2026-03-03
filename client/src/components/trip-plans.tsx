import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Route, ExternalLink, Printer, Clock, MapPin, Star, Search, Navigation } from "lucide-react";
import { TripPlan, LocationCoordinates } from "@/lib/types";

interface TripPlansProps {
  tripPlans: TripPlan[];
  isLoading: boolean;
  onSelectPlan: (plan: TripPlan) => void;
  userCoordinates?: LocationCoordinates | null;
}

export default function TripPlans({ tripPlans, isLoading, onSelectPlan, userCoordinates }: TripPlansProps) {
  const generateGoogleMapsLink = (plan: TripPlan) => {
    if (!userCoordinates) return "#";
    
    const waypoints = plan.stores
      .filter(s => s.store.lat && s.store.lng)
      .map(s => `${s.store.lat},${s.store.lng}`)
      .join('/');
    
    const origin = `${userCoordinates.lat},${userCoordinates.lng}`;
    
    return `https://www.google.com/maps/dir/${origin}/${waypoints}`;
  };

  const generateAppleMapsLink = (plan: TripPlan) => {
    if (!userCoordinates) return "#";
    
    const firstStore = plan.stores.find(s => s.store.lat && s.store.lng);
    if (!firstStore) return "#";
    
    // Apple Maps doesn't support multi-waypoint routing as easily, so we'll just route to the first store
    return `http://maps.apple.com/?saddr=${userCoordinates.lat},${userCoordinates.lng}&daddr=${firstStore.store.lat},${firstStore.store.lng}`;
  };

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  if (isLoading) {
    return (
      <Card className="shadow-sm border-0 shadow-md">
        <CardContent className="p-5">
          <h2 className="text-base font-semibold mb-4 flex items-center">
            <div className="bg-primary/10 rounded-lg p-1.5 mr-2.5">
              <Route className="text-primary" size={18} />
            </div>
            Optimized Trip Plans
          </h2>

          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/20 border-t-primary mr-3 mb-3"></div>
            <span className="text-sm text-muted-foreground">Calculating optimal routes...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm border-0 shadow-md">
      <CardContent className="p-5">
        <h2 className="text-base font-semibold mb-4 flex items-center">
          <div className="bg-primary/10 rounded-lg p-1.5 mr-2.5">
            <Route className="text-primary" size={18} />
          </div>
          Optimized Trip Plans
        </h2>

        {tripPlans.length === 0 ? (
          <div className="text-center py-12" data-testid="no-results">
            <div className="bg-muted rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <Search size={28} className="text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-base font-medium mb-1.5">No trip plans yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add items to your list and generate plans to see optimized routes.
            </p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="trip-plans">
            {tripPlans.map((plan, index) => (
              <div
                key={index}
                className="border border-border rounded-xl p-4 hover:shadow-md hover:border-primary/20 transition-all"
                data-testid={`trip-plan-${index}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    <div className="bg-gradient-to-br from-primary to-emerald-600 text-white rounded-lg w-8 h-8 flex items-center justify-center text-sm font-bold mr-3 shadow-sm">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-medium">
                        {plan.stores.length === 1 ? "Single Store Trip" : `${plan.stores.length} Store Combo`}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {plan.stores.map(s => s.store.name).join(" → ")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-secondary">
                      ${plan.totalCost.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Cost</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center p-2 bg-muted/50 rounded-lg">
                    <div className="text-sm font-semibold flex items-center justify-center">
                      <Clock size={13} className="mr-1 text-muted-foreground" />
                      {formatTime(plan.totalTime)}
                    </div>
                    <div className="text-xs text-muted-foreground">Time</div>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded-lg">
                    <div className="text-sm font-semibold flex items-center justify-center">
                      <MapPin size={13} className="mr-1 text-muted-foreground" />
                      {plan.totalDistance.toFixed(1)} mi
                    </div>
                    <div className="text-xs text-muted-foreground">Distance</div>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded-lg">
                    <div className="text-sm font-semibold flex items-center justify-center">
                      <Star size={13} className="mr-1 text-muted-foreground" />
                      {Math.round(plan.score)}
                    </div>
                    <div className="text-xs text-muted-foreground">Score</div>
                  </div>
                </div>

                {/* Items Coverage */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Items Available</span>
                    <Badge variant="secondary" className="text-xs">
                      {Math.round(plan.coverage * 100)}% coverage
                    </Badge>
                  </div>
                  
                  {plan.stores.map((storeData, storeIndex) => (
                    <div key={storeIndex} className="mb-3 last:mb-0">
                      {plan.stores.length > 1 && (
                        <div className="bg-muted rounded p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium">
                              Stop {storeIndex + 1}: {storeData.store.name}
                            </span>
                            <span className="text-xs text-secondary">
                              ${storeData.subtotal.toFixed(2)}
                            </span>
                          </div>
                          <div className="space-y-1">
                            {storeData.items.map((item, itemIndex) => (
                              <div key={itemIndex} className="flex justify-between text-xs">
                                <span>{item.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {plan.stores.length === 1 && (
                        <div className="space-y-1">
                          {storeData.items.map((item, itemIndex) => (
                            <div key={itemIndex} className="flex justify-between text-xs">
                              <span>{item.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex space-x-2">
                  <Button
                    onClick={() => onSelectPlan(plan)}
                    className="flex-1"
                    data-testid={`button-select-plan-${index}`}
                  >
                    Choose This Plan
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(generateGoogleMapsLink(plan), '_blank')}
                    data-testid={`button-google-maps-${index}`}
                    disabled={!userCoordinates}
                  >
                    <Navigation size={14} className="mr-1" />
                    Google
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(generateAppleMapsLink(plan), '_blank')}
                    data-testid={`button-apple-maps-${index}`}
                    disabled={!userCoordinates}
                  >
                    <ExternalLink size={14} className="mr-1" />
                    Apple
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.print()}
                    data-testid={`button-print-${index}`}
                  >
                    <Printer size={14} className="mr-1" />
                    Print
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

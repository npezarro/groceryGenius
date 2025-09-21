import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Route, ExternalLink, Printer, Clock, MapPin, Star, Search } from "lucide-react";
import { TripPlan } from "@/lib/types";

interface TripPlansProps {
  tripPlans: TripPlan[];
  isLoading: boolean;
  onSelectPlan: (plan: TripPlan) => void;
}

export default function TripPlans({ tripPlans, isLoading, onSelectPlan }: TripPlansProps) {
  const generateMapsLink = (plan: TripPlan, userLat?: number, userLng?: number) => {
    if (!userLat || !userLng) return "#";
    
    const waypoints = plan.stores
      .filter(s => s.store.lat && s.store.lng)
      .map(s => `${s.store.lat},${s.store.lng}`)
      .join('|');
    
    const origin = `${userLat},${userLng}`;
    const destination = waypoints.split('|')[waypoints.split('|').length - 1] || origin;
    
    return `https://www.google.com/maps/dir/${origin}/${waypoints}/${destination}`;
  };

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  if (isLoading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Route className="text-primary mr-2" size={20} />
            Optimized Trip Plans
          </h2>
          
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3"></div>
            <span className="text-muted-foreground">Calculating optimal routes...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <Route className="text-primary mr-2" size={20} />
          Optimized Trip Plans
        </h2>

        {tripPlans.length === 0 ? (
          <div className="text-center py-12" data-testid="no-results">
            <Search size={64} className="mx-auto text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">No trip plans found</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your location, radius, or item list.
            </p>
            <Button variant="outline">
              Adjust Filters
            </Button>
          </div>
        ) : (
          <div className="space-y-4" data-testid="trip-plans">
            {tripPlans.map((plan, index) => (
              <div
                key={index}
                className="border border-border rounded-lg p-4 hover:shadow-md transition-shadow"
                data-testid={`trip-plan-${index}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center text-sm font-semibold mr-3">
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

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-sm font-medium flex items-center justify-center">
                      <Clock size={14} className="mr-1" />
                      {formatTime(plan.totalTime)}
                    </div>
                    <div className="text-xs text-muted-foreground">Travel Time</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-medium flex items-center justify-center">
                      <MapPin size={14} className="mr-1" />
                      {plan.totalDistance.toFixed(1)} mi
                    </div>
                    <div className="text-xs text-muted-foreground">Distance</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-medium flex items-center justify-center">
                      <Star size={14} className="mr-1" />
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
                    onClick={() => window.open(generateMapsLink(plan), '_blank')}
                    data-testid={`button-maps-${index}`}
                  >
                    <ExternalLink size={14} className="mr-1" />
                    Maps
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

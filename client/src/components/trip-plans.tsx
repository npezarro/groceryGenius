import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Route, ExternalLink, Printer, Clock, MapPin, Star, Search, Navigation, DollarSign, ShoppingCart, Zap } from "lucide-react";
import { TripPlan, LocationCoordinates } from "@/lib/types";
import { getSemanticLabel as getSemanticLabelBase, formatTripTime, generateGoogleMapsLink, generateAppleMapsLink } from "@/lib/trip-utils";

const iconMap: Record<string, typeof Star> = {
  "Best Overall": Star,
  "Great Option": Star,
  "Good Option": Star,
  "Alternative": Star,
  "Best Price": DollarSign,
  "Best Coverage": ShoppingCart,
  "Quickest Trip": Zap,
};

function getSemanticLabel(plan: TripPlan, allPlans: TripPlan[]): { label: string; color: string; icon: typeof Star } {
  const base = getSemanticLabelBase(plan, allPlans);
  return { ...base, icon: iconMap[base.label] || Star };
}

interface TripPlansProps {
  tripPlans: TripPlan[];
  isLoading: boolean;
  onSelectPlan: (plan: TripPlan) => void;
  userCoordinates?: LocationCoordinates | null;
}

export default function TripPlans({ tripPlans, isLoading, onSelectPlan, userCoordinates }: TripPlansProps) {

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
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">
                          {plan.stores.length === 1 ? "Single Store Trip" : `${plan.stores.length} Store Combo`}
                        </h3>
                        <Badge
                          variant={plan.coverage >= 1 ? "default" : "secondary"}
                          className={
                            plan.coverage >= 1
                              ? "bg-green-600 text-white text-xs"
                              : plan.coverage >= 0.75
                                ? "bg-amber-500 text-white text-xs"
                                : "bg-red-500 text-white text-xs"
                          }
                        >
                          {Math.round(plan.coverage * 100)}% coverage
                        </Badge>
                      </div>
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
                      {formatTripTime(plan.totalTime)}
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
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-default">
                            <div className={`text-sm font-medium flex items-center justify-center ${getSemanticLabel(plan, tripPlans).color}`}>
                              {(() => {
                                const { label, icon: Icon } = getSemanticLabel(plan, tripPlans);
                                return (
                                  <>
                                    <Icon size={14} className="mr-1" />
                                    {label}
                                  </>
                                );
                              })()}
                            </div>
                            <div className="text-xs text-muted-foreground">Score: {Math.round(plan.score)}/100</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Overall score: {Math.round(plan.score)} out of 100</p>
                          <p className="text-xs text-muted-foreground">Based on price, travel time, and distance</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {/* Items Coverage */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Items Available</span>
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
                    onClick={() => window.open(generateGoogleMapsLink(plan, userCoordinates), '_blank')}
                    data-testid={`button-google-maps-${index}`}
                    disabled={!userCoordinates}
                  >
                    <Navigation size={14} className="mr-1" />
                    Google
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(generateAppleMapsLink(plan, userCoordinates), '_blank')}
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

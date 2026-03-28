import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Route, ExternalLink, Clock, MapPin, Star, Search, Navigation, DollarSign, ShoppingCart, Zap, Share2, ArrowLeft } from "lucide-react";
import { TripPlan, TripPlanItem, LocationCoordinates } from "@/lib/types";
import { getSemanticLabel as getSemanticLabelBase, formatTripTime, generateGoogleMapsLink, generateAppleMapsLink } from "@/lib/trip-utils";
import { useToast } from "@/hooks/use-toast";

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

function formatItemUnit(item: TripPlanItem): string {
  if (!item.unit) return "";
  const cleaned = item.unit.replace(/^1\s+/, "").trim();
  return `/${cleaned}`;
}

function shortStoreName(name: string): string {
  return name.replace(/\s*[—–-]\s*.+$/, "").trim();
}

interface TripPlansProps {
  tripPlans: TripPlan[];
  isLoading: boolean;
  onSelectPlan: (plan: TripPlan) => void;
  userCoordinates?: LocationCoordinates | null;
}

function PlanDetailView({ plan, allPlans, userCoordinates, onBack }: {
  plan: TripPlan;
  allPlans: TripPlan[];
  userCoordinates?: LocationCoordinates | null;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const { label, color, icon: LabelIcon } = getSemanticLabel(plan, allPlans);

  const handleShare = async () => {
    const lines = [
      `Grocery Trip Plan — ${shortStoreName(plan.stores[0]?.store.name || "Store")}`,
      `Total: $${plan.totalCost.toFixed(2)} | ${formatTripTime(plan.totalTime)} | ${plan.totalDistance.toFixed(1)} mi`,
      "",
    ];
    for (const storeData of plan.stores) {
      lines.push(`${shortStoreName(storeData.store.name)} — $${storeData.subtotal.toFixed(2)}`);
      if (storeData.store.address && storeData.store.address !== "94102 area") {
        lines.push(`  ${storeData.store.address}`);
      }
      for (const item of storeData.items) {
        lines.push(`  ${item.itemName} — $${item.price.toFixed(2)}${formatItemUnit(item)}`);
      }
      lines.push("");
    }
    const text = lines.join("\n");

    if (navigator.share) {
      try {
        await navigator.share({ title: "Grocery Trip Plan", text });
        return;
      } catch { /* user cancelled or not supported */ }
    }
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard", description: "Trip plan details copied" });
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={14} /> Back to all plans
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {plan.stores.length === 1 ? "Single Store Trip" : `${plan.stores.length} Store Combo`}
          </h3>
          <div className={`flex items-center gap-1 text-sm ${color}`}>
            <LabelIcon size={14} /> {label}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-secondary">${plan.totalCost.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">Total Cost</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border p-3 text-center">
          <Clock size={16} className="mx-auto mb-1 text-muted-foreground" />
          <div className="text-sm font-medium">{formatTripTime(plan.totalTime)}</div>
          <div className="text-xs text-muted-foreground">Travel Time</div>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <MapPin size={16} className="mx-auto mb-1 text-muted-foreground" />
          <div className="text-sm font-medium">{plan.totalDistance.toFixed(1)} mi</div>
          <div className="text-xs text-muted-foreground">Distance</div>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <ShoppingCart size={16} className="mx-auto mb-1 text-muted-foreground" />
          <div className="text-sm font-medium">{Math.round(plan.coverage * 100)}%</div>
          <div className="text-xs text-muted-foreground">Coverage</div>
        </div>
      </div>

      {/* Store breakdown with items, prices, and addresses */}
      {plan.stores.map((storeData, storeIndex) => (
        <div key={storeIndex} className="rounded-lg border border-border overflow-hidden">
          <div className="bg-muted px-4 py-3 flex justify-between items-start">
            <div>
              {plan.stores.length > 1 && (
                <span className="text-xs text-muted-foreground">Stop {storeIndex + 1}</span>
              )}
              <h4 className="font-medium">{shortStoreName(storeData.store.name)}</h4>
              {storeData.store.address && storeData.store.address !== "94102 area" && (
                <p className="text-xs text-muted-foreground">{storeData.store.address}</p>
              )}
            </div>
            <span className="text-sm font-semibold text-secondary">${storeData.subtotal.toFixed(2)}</span>
          </div>
          <div className="divide-y divide-border">
            {storeData.items.map((item, i) => (
              <div key={i} className="px-4 py-2 flex justify-between items-center">
                <span className="text-sm">{item.itemName}</span>
                <span className="text-sm font-medium text-foreground">
                  ${item.price.toFixed(2)}
                  <span className="text-xs text-muted-foreground">{formatItemUnit(item)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => window.open(generateGoogleMapsLink(plan, userCoordinates), '_blank')}
          disabled={!userCoordinates}
        >
          <Navigation size={14} className="mr-1" /> Google Maps
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => window.open(generateAppleMapsLink(plan, userCoordinates), '_blank')}
          disabled={!userCoordinates}
        >
          <ExternalLink size={14} className="mr-1" /> Apple Maps
        </Button>
        <Button variant="outline" size="sm" onClick={handleShare}>
          <Share2 size={14} className="mr-1" /> Share
        </Button>
      </div>
    </div>
  );
}

export default function TripPlans({ tripPlans, isLoading, onSelectPlan, userCoordinates }: TripPlansProps) {
  const [selectedPlanIndex, setSelectedPlanIndex] = useState<number | null>(null);

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

  const selectedPlan = selectedPlanIndex !== null ? tripPlans[selectedPlanIndex] : null;

  return (
    <Card className="shadow-sm">
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <Route className="text-primary mr-2" size={20} />
          Optimized Trip Plans
        </h2>

        {selectedPlan ? (
          <PlanDetailView
            plan={selectedPlan}
            allPlans={tripPlans}
            userCoordinates={userCoordinates}
            onBack={() => setSelectedPlanIndex(null)}
          />
        ) : tripPlans.length === 0 ? (
          <div className="text-center py-12" data-testid="no-results">
            <Search size={64} className="mx-auto text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">No trip plans found</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your location, radius, or item list.
            </p>
            <Button variant="outline">Adjust Filters</Button>
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
                        {plan.stores.map(s => shortStoreName(s.store.name)).join(" → ")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-secondary">${plan.totalCost.toFixed(2)}</div>
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

                {/* Items with prices */}
                <div className="mb-4">
                  {plan.stores.map((storeData, storeIndex) => (
                    <div key={storeIndex} className="mb-3 last:mb-0">
                      {plan.stores.length > 1 && (
                        <div className="text-xs text-muted-foreground mb-1 font-medium">
                          {shortStoreName(storeData.store.name)}
                          {storeData.store.address && storeData.store.address !== "94102 area" && (
                            <span className="font-normal"> — {storeData.store.address}</span>
                          )}
                        </div>
                      )}
                      {plan.stores.length === 1 && storeData.store.address && storeData.store.address !== "94102 area" && (
                        <div className="text-xs text-muted-foreground mb-2">
                          <MapPin size={10} className="inline mr-1" />{storeData.store.address}
                        </div>
                      )}
                      <div className="space-y-1">
                        {storeData.items.map((item, itemIndex) => (
                          <div key={itemIndex} className="flex justify-between text-xs">
                            <span>{item.itemName}</span>
                            <span className="font-medium">
                              ${item.price.toFixed(2)}
                              <span className="text-muted-foreground">{formatItemUnit(item)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex space-x-2">
                  <Button
                    onClick={() => {
                      setSelectedPlanIndex(index);
                      onSelectPlan(plan);
                    }}
                    className="flex-1"
                    data-testid={`button-select-plan-${index}`}
                  >
                    Choose This Plan
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(generateGoogleMapsLink(plan, userCoordinates), '_blank')}
                    disabled={!userCoordinates}
                  >
                    <Navigation size={14} className="mr-1" /> Google
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(generateAppleMapsLink(plan, userCoordinates), '_blank')}
                    disabled={!userCoordinates}
                  >
                    <ExternalLink size={14} className="mr-1" /> Apple
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

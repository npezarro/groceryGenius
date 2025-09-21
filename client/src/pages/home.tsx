import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import ShoppingList from "@/components/shopping-list";
import LocationPreferences from "@/components/location-preferences";
import MapView from "@/components/map-view";
import TripPlans from "@/components/trip-plans";
import AdminPanel from "@/components/admin-panel";
import { ShoppingListItem, LocationCoordinates, TripWeights, TripPlan } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Home() {
  const { toast } = useToast();
  
  // State
  const [shoppingItems, setShoppingItems] = useState<ShoppingListItem[]>([]);
  const [location, setLocation] = useState("123 Main St, San Francisco, CA");
  const [coordinates, setCoordinates] = useState<LocationCoordinates | null>(null);
  const [radius, setRadius] = useState(5);
  const [weights, setWeights] = useState<TripWeights>({
    price: 0.6,
    time: 0.25,
    distance: 0.15
  });
  const [tripPlans, setTripPlans] = useState<TripPlan[]>([]);
  const [stores, setStores] = useState<any[]>([]);

  // Fetch stores based on location and radius
  const { data: nearbyStores } = useQuery({
    queryKey: ['/api/stores', coordinates?.lat, coordinates?.lng, radius],
    queryFn: async () => {
      if (!coordinates) return [];
      
      const response = await fetch(`/api/stores?lat=${coordinates.lat}&lng=${coordinates.lng}&radius=${radius}`);
      if (!response.ok) throw new Error('Failed to fetch stores');
      return response.json();
    },
    enabled: !!coordinates
  });

  // Update stores state when nearbyStores changes
  useEffect(() => {
    if (nearbyStores) {
      setStores(nearbyStores);
    }
  }, [nearbyStores]);

  // Trip planning mutation
  const generatePlansMutation = useMutation({
    mutationFn: async () => {
      if (!coordinates || shoppingItems.length === 0) {
        throw new Error("Location and shopping items are required");
      }

      const response = await apiRequest('POST', '/api/trip-plans', {
        items: shoppingItems.map(item => item.name),
        location: coordinates,
        radius,
        weights
      });
      
      return response.json();
    },
    onSuccess: (plans) => {
      setTripPlans(plans);
      if (plans.length === 0) {
        toast({
          title: "No plans found",
          description: "Try adjusting your location, radius, or items",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Trip plans generated",
          description: `Found ${plans.length} optimized routes`
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Planning failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleGeneratePlans = () => {
    if (!coordinates) {
      toast({
        title: "Location required",
        description: "Please set a location first",
        variant: "destructive"
      });
      return;
    }
    
    if (shoppingItems.length === 0) {
      toast({
        title: "Items required",
        description: "Please add items to your shopping list",
        variant: "destructive"
      });
      return;
    }

    generatePlansMutation.mutate();
  };

  const handleSelectPlan = (plan: TripPlan) => {
    toast({
      title: "Plan selected",
      description: `Route with ${plan.stores.length} store(s) - $${plan.totalCost.toFixed(2)}`,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <svg className="w-8 h-8 text-primary" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 4V2C7 1.45 7.45 1 8 1H16C16.55 1 17 1.45 17 2V4H20C20.55 4 21 4.45 21 5S20.55 6 20 6H19V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V6H4C3.45 6 3 5.55 3 5S3.45 4 4 4H7ZM9 3V4H15V3H9ZM7 6V19H17V6H7Z"/>
              </svg>
              <h1 className="text-xl font-bold text-foreground">Grocery Trip Planner</h1>
            </div>
            <nav className="hidden md:flex space-x-6">
              <a href="#planner" className="text-primary font-medium">Trip Planner</a>
              <a href="#admin" className="text-muted-foreground hover:text-foreground">Admin</a>
              <a href="#help" className="text-muted-foreground hover:text-foreground">Help</a>
            </nav>
            <button className="md:hidden p-2">
              <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" id="planner">
          {/* Left Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <ShoppingList
              items={shoppingItems}
              onItemsChange={setShoppingItems}
            />
            
            <LocationPreferences
              location={location}
              coordinates={coordinates}
              radius={radius}
              weights={weights}
              onLocationChange={setLocation}
              onCoordinatesChange={setCoordinates}
              onRadiusChange={setRadius}
              onWeightsChange={setWeights}
              onGeneratePlans={handleGeneratePlans}
              isGenerating={generatePlansMutation.isPending}
            />
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <MapView
              coordinates={coordinates}
              stores={stores}
              radius={radius}
            />
            
            <TripPlans
              tripPlans={tripPlans}
              isLoading={generatePlansMutation.isPending}
              onSelectPlan={handleSelectPlan}
            />
            
            <AdminPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

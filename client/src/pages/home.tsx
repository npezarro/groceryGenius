import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import ShoppingList from "@/components/shopping-list";
import LocationPreferences from "@/components/location-preferences";
import MapView from "@/components/map-view";
import TripPlans from "@/components/trip-plans";
import FavoriteStores from "@/components/favorite-stores";
import SubmitPrice from "@/components/submit-price";
import ReceiptUpload from "@/components/receipt-upload";
import { ShoppingCart, LogOut, Settings, AlertTriangle } from "lucide-react";
import { ShoppingListItem, LocationCoordinates, TripWeights, TripPlan } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { apiUrl } from "@/lib/api";

export default function Home() {
  const { toast } = useToast();
  const { user, logout } = useAuth();
  
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
  const [userHasMembership, setUserHasMembership] = useState(false);
  const [tripPlans, setTripPlans] = useState<TripPlan[]>([]);
  const [stores, setStores] = useState<any[]>([]);

  // Fetch stores based on location and radius
  const { data: nearbyStores } = useQuery({
    queryKey: ['/api/stores', coordinates?.lat, coordinates?.lng, radius],
    queryFn: async () => {
      if (!coordinates) return [];
      
      const response = await fetch(apiUrl(`/api/stores?lat=${coordinates.lat}&lng=${coordinates.lng}&radius=${radius}`));
      if (!response.ok) throw new Error('Failed to fetch stores');
      return response.json();
    },
    enabled: !!coordinates
  });

  // Auto-geocode default location on page load
  useEffect(() => {
    const geocodeDefaultLocation = async () => {
      if (!coordinates && location) {
        try {
          const response = await fetch(apiUrl('/api/geocode'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: location })
          });

          if (response.ok) {
            const coords = await response.json();
            setCoordinates(coords);
          }
        } catch (error) {
          console.log('Failed to geocode default location:', error);
        }
      }
    };

    geocodeDefaultLocation();
  }, [location, coordinates]);

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
        weights,
        userHasMembership
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
      <header className="bg-gradient-to-r from-primary to-emerald-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="bg-white/20 rounded-lg p-1.5">
                <ShoppingCart className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Grocery Genius</h1>
                <p className="text-xs text-white/70 -mt-0.5 hidden sm:block">Smart Trip Planner</p>
              </div>
            </div>
            <nav className="flex items-center space-x-3">
              {user ? (
                <>
                  {user.isAdmin && (
                    <Link href="/admin" className="text-white/70 hover:text-white transition-colors" title="Admin Dashboard">
                      <Settings size={16} />
                    </Link>
                  )}
                  <span className="text-sm text-white/80 hidden sm:inline">
                    {user.displayName || user.username}
                  </span>
                  <button
                    onClick={() => logout()}
                    className="text-sm text-white/80 hover:text-white flex items-center gap-1.5 transition-colors"
                  >
                    <LogOut size={14} />
                    <span className="hidden sm:inline">Sign Out</span>
                  </button>
                </>
              ) : (
                <Link href="/auth" className="text-sm text-white font-medium bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors">
                  Sign In
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      {user && !user.emailVerified && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle size={14} />
              <span>Please verify your email address.</span>
            </div>
            <Link href="/verify-email" className="text-sm font-medium text-amber-700 hover:text-amber-900 transition-colors">
              Verify now
            </Link>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="planner">
          {/* Left Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <ShoppingList
              items={shoppingItems}
              onItemsChange={setShoppingItems}
              userHasMembership={userHasMembership}
            />
            
            <LocationPreferences
              location={location}
              coordinates={coordinates}
              radius={radius}
              weights={weights}
              userHasMembership={userHasMembership}
              onLocationChange={setLocation}
              onCoordinatesChange={setCoordinates}
              onRadiusChange={setRadius}
              onWeightsChange={setWeights}
              onMembershipChange={setUserHasMembership}
              onGeneratePlans={handleGeneratePlans}
              isGenerating={generatePlansMutation.isPending}
            />

            <FavoriteStores stores={stores} />
            <SubmitPrice stores={stores} />
            <ReceiptUpload stores={stores} />
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
              userCoordinates={coordinates}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

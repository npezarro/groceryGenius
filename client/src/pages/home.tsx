import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import ShoppingList from "@/components/shopping-list";
import LocationPreferences from "@/components/location-preferences";
import MapView from "@/components/map-view";
import TripPlans from "@/components/trip-plans";
import AdminPanel from "@/components/admin-panel";
import FavoriteStores from "@/components/favorite-stores";
import SubmitPrice from "@/components/submit-price";
import ReceiptUpload from "@/components/receipt-upload";
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
      <header className="bg-[#f9f7f2] border-b border-border/80">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <svg className="w-8 h-8 text-foreground" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 4V2C7 1.45 7.45 1 8 1H16C16.55 1 17 1.45 17 2V4H20C20.55 4 21 4.45 21 5S20.55 6 20 6H19V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V6H4C3.45 6 3 5.55 3 5S3.45 4 4 4H7ZM9 3V4H15V3H9ZM7 6V19H17V6H7Z"/>
              </svg>
              <h1 className="text-3xl font-medium font-serif tracking-tight text-foreground">Grocery Genius</h1>
            </div>
            <nav className="flex items-center space-x-5 text-sm">
              <a href="#planner" className="hidden md:inline text-muted-foreground hover:text-foreground">Planner</a>
              <a href="#admin" className="hidden md:inline text-muted-foreground hover:text-foreground">Admin</a>
              {user ? (
                <>
                  <span className="text-sm text-muted-foreground hidden sm:inline">
                    {user.displayName || user.username}
                  </span>
                  <button
                    onClick={() => logout()}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link href="/auth" className="inline-flex h-9 items-center px-5 rounded-full border border-input bg-background hover:bg-muted transition-colors font-medium">
                  Sign In
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-12 pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div className="space-y-6">
            <p className="text-xs tracking-[0.4em] text-[#2f5d4d] uppercase">Grocery Planning</p>
            <h2 className="text-5xl md:text-6xl font-serif leading-[1.05] tracking-tight max-w-xl">
              Turn your grocery list into a clear optimized trip plan.
            </h2>
            <p className="text-2xl text-muted-foreground leading-relaxed max-w-2xl">
              Add your items, set location preferences, compare routes, and generate actionable plans with a calmer runEval-style interface.
            </p>
          </div>
          <div className="rounded-3xl border border-border bg-card/95 p-6 shadow-sm min-h-[300px]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-4xl font-serif">Snapshot</h3>
              <span className="text-xs rounded-full px-3 py-1 bg-muted text-muted-foreground font-semibold">LIVE</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-2xl border border-border bg-background p-3 text-center">
                <p className="text-xs text-muted-foreground">Items</p>
                <p className="text-3xl font-semibold">{shoppingItems.length}</p>
              </div>
              <div className="rounded-2xl border border-border bg-background p-3 text-center">
                <p className="text-xs text-muted-foreground">Stores</p>
                <p className="text-3xl font-semibold">{stores.length}</p>
              </div>
              <div className="rounded-2xl border border-border bg-background p-3 text-center">
                <p className="text-xs text-muted-foreground">Plans</p>
                <p className="text-3xl font-semibold">{tripPlans.length}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Your planner updates in real-time as you add items and tune optimization weights.
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 lg:px-10 pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" id="planner">
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
            
            <AdminPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MapPin, Crosshair, Route, Star } from "lucide-react";
import { LocationCoordinates, TripWeights } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

interface LocationPreferencesProps {
  location: string;
  coordinates: LocationCoordinates | null;
  radius: number;
  weights: TripWeights;
  userHasMembership: boolean;
  onLocationChange: (location: string) => void;
  onCoordinatesChange: (coordinates: LocationCoordinates | null) => void;
  onRadiusChange: (radius: number) => void;
  onWeightsChange: (weights: TripWeights) => void;
  onMembershipChange: (hasMembership: boolean) => void;
  onGeneratePlans: () => void;
  isGenerating: boolean;
}

export default function LocationPreferences({
  location,
  coordinates,
  radius,
  weights,
  userHasMembership,
  onLocationChange,
  onCoordinatesChange,
  onRadiusChange,
  onWeightsChange,
  onMembershipChange,
  onGeneratePlans,
  isGenerating
}: LocationPreferencesProps) {
  const { toast } = useToast();
  const [isGeolocating, setIsGeolocating] = useState(false);

  // Ensure weights sum to 100%
  const normalizeWeights = (newWeights: Partial<TripWeights>) => {
    const updated = { ...weights, ...newWeights };
    const total = updated.price + updated.time + updated.distance;
    
    if (total > 0) {
      return {
        price: updated.price / total,
        time: updated.time / total,
        distance: updated.distance / total
      };
    }
    
    return weights;
  };

  const geocodeLocation = async (address: string) => {
    try {
      const response = await fetch(apiUrl('/api/geocode'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      });

      if (response.ok) {
        const coords = await response.json();
        onCoordinatesChange(coords);
        toast({
          title: "Location found",
          description: `Coordinates: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
        });
      } else {
        throw new Error('Geocoding failed');
      }
    } catch (error) {
      toast({
        title: "Geocoding failed",
        description: "Could not find coordinates for this address",
        variant: "destructive"
      });
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation not supported",
        description: "Your browser doesn't support location services",
        variant: "destructive"
      });
      return;
    }

    setIsGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        onCoordinatesChange(coords);
        onLocationChange(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
        setIsGeolocating(false);
        
        toast({
          title: "Location obtained",
          description: "Using your current location"
        });
      },
      (error) => {
        setIsGeolocating(false);
        toast({
          title: "Location access denied",
          description: "Please enter an address manually",
          variant: "destructive"
        });
      }
    );
  };

  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (location.trim()) {
      geocodeLocation(location.trim());
    }
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <MapPin className="text-primary mr-2" size={20} />
          Location & Preferences
        </h2>

        {/* Location Input */}
        <form onSubmit={handleLocationSubmit} className="mb-4">
          <label className="block text-sm font-medium text-muted-foreground mb-2">
            Starting Location
          </label>
          <div className="relative">
            <Input
              type="text"
              placeholder="Enter address or ZIP code"
              value={location}
              onChange={(e) => onLocationChange(e.target.value)}
              className="pr-10"
              data-testid="input-location"
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={getCurrentLocation}
              disabled={isGeolocating}
              className="absolute right-2 top-2 h-6 w-6 p-0"
              title="Use current location"
              data-testid="button-current-location"
            >
              <Crosshair size={14} className={isGeolocating ? "animate-spin" : ""} />
            </Button>
          </div>
          {coordinates && (
            <p className="text-xs text-muted-foreground mt-1">
              Found: {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
            </p>
          )}
        </form>

        {/* Store Radius */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-muted-foreground mb-2">
            Store Radius: <span className="text-primary font-semibold">{radius} miles</span>
          </label>
          <Slider
            value={[radius]}
            onValueChange={(value) => onRadiusChange(value[0])}
            min={1}
            max={25}
            step={1}
            className="w-full"
            data-testid="slider-radius"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1 mi</span>
            <span>25 mi</span>
          </div>
        </div>

        {/* Member Benefits Toggle */}
        <div className="space-y-2">
          <div className="flex items-center justify-between space-x-2">
            <div className="flex items-center space-x-2">
              <Star className="w-4 h-4 text-yellow-500" />
              <Label htmlFor="membership-toggle" className="text-sm font-medium">
                Store Membership Benefits
              </Label>
            </div>
            <Switch
              id="membership-toggle"
              checked={userHasMembership}
              onCheckedChange={onMembershipChange}
              data-testid="switch-membership"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {userHasMembership 
              ? "Member pricing and exclusive deals will be applied to trip plans" 
              : "Enable to see member discounts and special offers"}
          </p>
        </div>

        {/* Weight Sliders */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Trip Optimization Weights</h3>
          
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm">Price</label>
              <span className="text-xs text-primary font-semibold">
                {Math.round(weights.price * 100)}%
              </span>
            </div>
            <Slider
              value={[weights.price * 100]}
              onValueChange={(value) => 
                onWeightsChange(normalizeWeights({ price: value[0] / 100 }))
              }
              min={0}
              max={100}
              step={5}
              className="w-full"
              data-testid="slider-price-weight"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm">Travel Time</label>
              <span className="text-xs text-primary font-semibold">
                {Math.round(weights.time * 100)}%
              </span>
            </div>
            <Slider
              value={[weights.time * 100]}
              onValueChange={(value) => 
                onWeightsChange(normalizeWeights({ time: value[0] / 100 }))
              }
              min={0}
              max={100}
              step={5}
              className="w-full"
              data-testid="slider-time-weight"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm">Distance</label>
              <span className="text-xs text-primary font-semibold">
                {Math.round(weights.distance * 100)}%
              </span>
            </div>
            <Slider
              value={[weights.distance * 100]}
              onValueChange={(value) => 
                onWeightsChange(normalizeWeights({ distance: value[0] / 100 }))
              }
              min={0}
              max={100}
              step={5}
              className="w-full"
              data-testid="slider-distance-weight"
            />
          </div>
        </div>

        {/* Generate Plans Button */}
        <Button
          onClick={onGeneratePlans}
          disabled={!coordinates || isGenerating}
          className="w-full mt-6 flex items-center justify-center"
          data-testid="button-generate-plans"
        >
          <Route className="mr-2" size={16} />
          {isGenerating ? "Generating..." : "Generate Trip Plans"}
        </Button>
      </CardContent>
    </Card>
  );
}

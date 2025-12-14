import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, MapPin, Camera, WifiOff } from "lucide-react";
import { useScrollIntoView } from "@/hooks/ui/useScrollIntoView";

interface RestaurantSearchBarProps {
  mode: "initial" | "refine";
  restaurantSearchQuery: string;
  setRestaurantSearchQuery: (query: string) => void;
  manualLocation: string;
  setManualLocation: (location: string) => void;
  isOnline: boolean;
  onSearch: () => void;
  onUseGPS: () => void;
  onNavigateToCreateRestaurant?: () => void;
  onShowCamera: () => void;
}

export default function RestaurantSearchBar({
  mode,
  restaurantSearchQuery,
  setRestaurantSearchQuery,
  manualLocation,
  setManualLocation,
  isOnline,
  onSearch,
  onUseGPS,
  onNavigateToCreateRestaurant,
  onShowCamera,
}: RestaurantSearchBarProps) {
  // Refs for auto-scrolling inputs into view on mobile
  const restaurantSearchInputRef = useScrollIntoView<HTMLInputElement>();
  const manualLocationInputRef = useScrollIntoView<HTMLInputElement>();

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSearch();
    }
  };

  return (
    <Card className="border-2 border-blue-200 bg-blue-50/30 gap-0 py-3">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Search className="w-5 h-5 text-blue-600" />
          {mode === "initial" ? "Search for Food Places" : "Search Again"}
        </CardTitle>
        {mode === "refine" && (
          <CardDescription>
            Refine your search or try a new location
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Restaurant name/type search */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor={`restaurant-search-${mode}`}
              className="text-sm font-medium text-gray-700"
            >
              Place name or type
            </Label>
            <button
              type="button"
              onClick={onShowCamera}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <Camera className="w-3.5 h-3.5" />
              Use camera
            </button>
          </div>
          <Input
            ref={restaurantSearchInputRef}
            id={`restaurant-search-${mode}`}
            type="text"
            placeholder="e.g., Starbucks, cafe, bakery, dessert"
            value={restaurantSearchQuery}
            onChange={(e) => setRestaurantSearchQuery(e.target.value)}
            onKeyDown={handleKeyPress}
            className="bg-white"
          />
        </div>

        {/* Manual location search */}
        <div className="space-y-2">
          <Label
            htmlFor={`manual-location-${mode}`}
            className="text-sm font-medium text-gray-700"
          >
            Location (city, zip code, or address)
          </Label>
          <div className="flex gap-2">
            <Input
              ref={manualLocationInputRef}
              id={`manual-location-${mode}`}
              type="text"
              placeholder="e.g., 90210, Los Angeles, CA"
              value={manualLocation}
              onChange={(e) => setManualLocation(e.target.value)}
              onKeyDown={handleKeyPress}
              className="bg-white flex-1"
            />
            <Button
              onClick={onUseGPS}
              variant="outline"
              className="bg-white shrink-0"
              disabled={!isOnline}
              title="Use My Current Location"
            >
              <MapPin className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Button
          onClick={onSearch}
          variant="default"
          className="w-full"
          disabled={!isOnline}
        >
          {isOnline ? (
            <>
              <Search className="w-4 h-4 mr-2" />
              {mode === "initial" ? "Search Food Places" : "New Search"}
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 mr-2" />
              {mode === "initial" ? "Search (Offline)" : "Offline"}
            </>
          )}
        </Button>

        {!isOnline && (
          <p className="text-xs text-orange-600 text-center">
            Google Places search requires internet connection
          </p>
        )}

        {mode === "initial" && onNavigateToCreateRestaurant && (
          <div className="text-center">
            <button
              onClick={onNavigateToCreateRestaurant}
              className="text-sm text-blue-600 hover:text-blue-700 underline"
            >
              Add new restaurant
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

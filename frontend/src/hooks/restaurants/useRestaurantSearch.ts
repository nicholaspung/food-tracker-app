import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Restaurant } from "@/hooks/api/useRestaurants";
import {
  searchAndCacheRestaurantsByText,
  geocodeLocation,
} from "@/services/googlePlaces";

interface UseRestaurantSearchOptions {
  isOnline: boolean;
}

interface UseRestaurantSearchReturn {
  // Search state
  restaurantSearchQuery: string;
  setRestaurantSearchQuery: (query: string) => void;
  manualLocation: string;
  setManualLocation: (location: string) => void;

  // Results
  results: Restaurant[];
  isSearching: boolean;
  error: string;

  // Location context
  currentLocationContext: {
    type: "gps" | "manual";
    location?: string;
    latitude?: number;
    longitude?: number;
  } | null;

  // Reference coordinates for distance calculation
  referenceCoords: { lat: number; lng: number } | null;

  // Actions
  search: () => Promise<void>;
  clearSearch: () => void;

  // Success state
  showSuccessNotification: boolean;
}

export function useRestaurantSearch({
  isOnline,
}: UseRestaurantSearchOptions): UseRestaurantSearchReturn {
  const queryClient = useQueryClient();

  // Search inputs
  const [restaurantSearchQuery, setRestaurantSearchQuery] = useState("");
  const [manualLocation, setManualLocation] = useState("");

  // Search results
  const [results, setResults] = useState<Restaurant[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  // Location context
  const [currentLocationContext, setCurrentLocationContext] = useState<{
    type: "gps" | "manual";
    location?: string;
    latitude?: number;
    longitude?: number;
  } | null>(null);

  // Reference coordinates for distance calculation
  const [referenceCoords, setReferenceCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Success notification
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);

  // Auto-dismiss success notification
  useEffect(() => {
    if (showSuccessNotification) {
      const timer = setTimeout(() => {
        setShowSuccessNotification(false);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [showSuccessNotification]);

  // Handle manual location and text search
  const search = async () => {
    // Check if online first
    if (!isOnline) {
      setError(
        "Cannot search restaurants while offline. Google Places requires internet connection."
      );
      return;
    }

    if (!manualLocation.trim() && !restaurantSearchQuery.trim()) {
      setError("Please enter a location or food place name to search");
      return;
    }

    setIsSearching(true);
    setError("");
    setShowSuccessNotification(false);

    try {
      let coords: { lat: number; lng: number } | null = null;
      if (manualLocation.trim()) {
        coords = await geocodeLocation(manualLocation.trim());
        if (coords) {
          setReferenceCoords(coords);
        }
      }

      setCurrentLocationContext({
        type: "manual",
        location: manualLocation.trim(),
        latitude: coords?.lat,
        longitude: coords?.lng,
      });

      const restaurants = await searchAndCacheRestaurantsByText({
        query: restaurantSearchQuery.trim() || "food",
        location: manualLocation.trim() || undefined,
        radius: 5000,
      });

      setResults(restaurants);
      setShowSuccessNotification(true);

      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to search food places"
      );
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setResults([]);
    setError("");
    setCurrentLocationContext(null);
    setReferenceCoords(null);
    setShowSuccessNotification(false);
  };

  return {
    restaurantSearchQuery,
    setRestaurantSearchQuery,
    manualLocation,
    setManualLocation,
    results,
    isSearching,
    error,
    currentLocationContext,
    referenceCoords,
    search,
    clearSearch,
    showSuccessNotification,
  };
}

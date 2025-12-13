import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Restaurant } from "@/hooks/api/useRestaurants";
import { useGeolocation } from "@/hooks/useGeolocation";
import { searchAndCacheNearbyRestaurants } from "@/services/googlePlaces";

interface UseNearbyRestaurantsOptions {
  isOnline: boolean;
}

interface UseNearbyRestaurantsReturn {
  // GPS state
  currentLocation: {
    latitude: number;
    longitude: number;
  } | null;
  locationLoading: boolean;
  locationError: string | null;

  // Nearby restaurants
  nearbyRestaurants: Restaurant[];
  isLoading: boolean;
  error: string;

  // Success state
  showSuccessNotification: boolean;

  // Reference coordinates for distance calculation
  referenceCoords: { lat: number; lng: number } | null;

  // Actions
  requestLocation: () => Promise<void>;
  clearResults: () => void;
}

export function useNearbyRestaurants({
  isOnline,
}: UseNearbyRestaurantsOptions): UseNearbyRestaurantsReturn {
  const queryClient = useQueryClient();

  // Location - only fetch when user requests nearby search
  const {
    position,
    error: locationError,
    loading: locationLoading,
    refetch: refetchLocation,
  } = useGeolocation(false);

  // Nearby restaurants
  const [nearbyRestaurants, setNearbyRestaurants] = useState<Restaurant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

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

  // Handler to search nearby places
  const requestLocation = async () => {
    // Check if online first
    if (!isOnline) {
      setError(
        "Cannot search nearby restaurants while offline. Google Places requires internet connection."
      );
      return;
    }

    setError("");

    if (!position && !locationLoading) {
      refetchLocation();
    }

    if (position) {
      setReferenceCoords({
        lat: position.latitude,
        lng: position.longitude,
      });

      setIsLoading(true);
      try {
        const restaurants = await searchAndCacheNearbyRestaurants({
          latitude: position.latitude,
          longitude: position.longitude,
          radius: 5000,
        });

        setNearbyRestaurants(restaurants);
        setShowSuccessNotification(true);

        queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load nearby food places"
        );
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Watch for location changes when user is viewing nearby places
  useEffect(() => {
    if (
      position &&
      nearbyRestaurants.length === 0 &&
      !isLoading &&
      isOnline // Only fetch if online
    ) {
      const fetchNearbyPlaces = async () => {
        setReferenceCoords({
          lat: position.latitude,
          lng: position.longitude,
        });

        setIsLoading(true);
        setError("");
        try {
          const restaurants = await searchAndCacheNearbyRestaurants({
            latitude: position.latitude,
            longitude: position.longitude,
            radius: 5000,
          });

          setNearbyRestaurants(restaurants);
          setShowSuccessNotification(true);
          queryClient.invalidateQueries({ queryKey: ["restaurants"] });
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load nearby food places"
          );
        } finally {
          setIsLoading(false);
        }
      };

      fetchNearbyPlaces();
    }
  }, [position, isOnline]);

  const clearResults = () => {
    setNearbyRestaurants([]);
    setError("");
    setReferenceCoords(null);
    setShowSuccessNotification(false);
  };

  return {
    currentLocation: position
      ? { latitude: position.latitude, longitude: position.longitude }
      : null,
    locationLoading,
    locationError,
    nearbyRestaurants,
    isLoading,
    error,
    showSuccessNotification,
    referenceCoords,
    requestLocation,
    clearResults,
  };
}

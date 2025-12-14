import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ProcessedPhoto, QuickTrackPhotoData } from "@/types/photos";
import { useOfflineVisitCreation } from "@/hooks/offline/useOfflineVisitCreation";
import { useOfflineQuickTrack } from "@/hooks/offline/useOfflineQuickTrack";
import { processPhotosDraftService } from "@/services/processPhotosDraftServiceDB";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { format } from "date-fns";

/**
 * Hook for submitting processed photos (both restaurant visits and quick track items)
 *
 * Handles:
 * - Submitting restaurant visits (grouped by restaurant + date)
 * - Submitting quick track items
 * - Navigation on success
 * - Draft cleanup
 * - Error handling
 */
export function usePhotoSubmission() {
  const navigate = useNavigate();
  const visitCreationMutation = useOfflineVisitCreation();
  const quickTrackMutation = useOfflineQuickTrack();
  const { handleError } = useErrorHandler({
    source: "usePhotoSubmission",
    autoClearMs: 5000,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Submit restaurant visits
   * Groups photos by restaurant AND date, then creates a visit for each group
   */
  const submitRestaurantVisits = async (
    photos: ProcessedPhoto[],
    visibility: "friends" | "private"
  ) => {
    setIsSubmitting(true);

    try {
      // Group photos by restaurant AND date
      const photosByRestaurantAndDate = new Map<string, ProcessedPhoto[]>();
      for (const photo of photos) {
        const restaurantId = photo.restaurant.id;
        // Normalize date to start of day for grouping
        const photoDate = photo.captureDate || new Date();
        const dateKey = format(photoDate, "yyyy-MM-dd");
        const groupKey = `${restaurantId}__${dateKey}`;

        if (!photosByRestaurantAndDate.has(groupKey)) {
          photosByRestaurantAndDate.set(groupKey, []);
        }
        photosByRestaurantAndDate.get(groupKey)!.push(photo);
      }

      // Submit each group as a separate visit
      for (const [_groupKey, groupPhotos] of photosByRestaurantAndDate) {
        const firstPhoto = groupPhotos[0];
        const visitDate = firstPhoto.captureDate || new Date();

        await visitCreationMutation.mutateAsync({
          restaurant: firstPhoto.restaurant.id,
          foodItems: groupPhotos.map((p) => ({
            name: p.menuItemName,
            description: p.menuItemDescription,
            rating: p.rating,
            notes: p.notes,
          })),
          itemPhotos: new Map(groupPhotos.map((p, index) => [index, p.photo])),
          visitDate: visitDate.toISOString(),
          visibility,
          notes: '',
        });
      }

      // Success - clear draft and navigate
      await processPhotosDraftService.clearDraft();
      navigate({ to: "/home" });
    } catch (error) {
      console.error("Failed to save restaurant visits:", error);
      handleError(error as Error, {
        customMessage: "Failed to save visits. Please try again.",
      });
      throw error; // Re-throw so caller knows it failed
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Submit quick track items
   */
  const submitQuickTrackItems = async (items: QuickTrackPhotoData[]) => {
    setIsSubmitting(true);

    try {
      // Process each quick track item
      for (const item of items) {
        await quickTrackMutation.mutateAsync({
          name: item.itemName,
          rating: item.rating,
          notes: item.notes || undefined,
          itemCategory: item.category || undefined,
          location_text: item.locationText || undefined,
          photo: item.photo,
          visibility: item.visibility,
          itemDate: item.captureDate ? item.captureDate.toISOString() : undefined,
        });
      }

      // Success - clear draft and navigate
      await processPhotosDraftService.clearDraft();
      navigate({ to: "/home" });
    } catch (error) {
      console.error("Failed to save quick track items:", error);
      handleError(error as Error, {
        customMessage: "Failed to save quick track items. Please try again.",
      });
      throw error; // Re-throw so caller knows it failed
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isSubmitting,
    submitRestaurantVisits,
    submitQuickTrackItems,
  };
}

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Check, MapPin, ArrowLeft, Loader2 } from "lucide-react";
import { ProcessedPhoto } from "@/types/photos";
import { RATING_COLORS, RATING_LABELS } from "@/lib/ratingConstants";
import { VisibilityToggle } from "@/components/ui/VisibilityToggle";
import { format } from "date-fns";

interface RestaurantReviewScreenProps {
  processedPhotos: ProcessedPhoto[];
  visitVisibility: "friends" | "private";
  onVisibilityChange: (v: "friends" | "private") => void;
  onEdit: () => void;
  onSubmitAll: () => void;
  isSubmitting: boolean;
  isKeyboardVisible: boolean;
}

/**
 * Restaurant Review Screen - Review all restaurant visits before submission
 * Groups photos by restaurant AND date
 */
export function RestaurantReviewScreen({
  processedPhotos,
  visitVisibility,
  onVisibilityChange,
  onEdit,
  onSubmitAll,
  isSubmitting,
  isKeyboardVisible,
}: RestaurantReviewScreenProps) {
  // Group by restaurant AND date
  const photosByRestaurantAndDate = new Map<string, ProcessedPhoto[]>();
  for (const photo of processedPhotos) {
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

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b-2 border-blue-500 px-4 py-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="bg-blue-100 p-1.5 rounded">
            <Check className="h-4 w-4 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Review Your Visits
          </h1>
        </div>
        <p className="text-sm text-gray-500 mt-1 ml-8">
          {photosByRestaurantAndDate.size} visit
          {photosByRestaurantAndDate.size !== 1 ? "s" : ""} •{" "}
          {processedPhotos.length} item
          {processedPhotos.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Content - Visits Preview */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
        {/* Review Notice */}
        <div className="bg-blue-50 border border-blue-200 px-4 py-2 rounded-lg">
          <p className="text-sm text-blue-800">
            Review your entries below. You can edit or submit when ready.
          </p>
        </div>

        {/* Visibility Checkbox */}
        <VisibilityToggle
          value={visitVisibility}
          onChange={onVisibilityChange}
          entityType="visits"
        />

        {Array.from(photosByRestaurantAndDate.entries()).map(
          ([groupKey, restaurantPhotos]) => {
            const restaurant = restaurantPhotos[0].restaurant;
            const visitDate = restaurantPhotos[0].captureDate || new Date();

            return (
              <Card key={groupKey} className="border-l-4 border-l-blue-500">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">
                        {restaurant.name}
                      </CardTitle>
                      <CardDescription className="space-y-1">
                        <div className="flex items-center gap-1 text-orange-700 font-semibold">
                          📅 {format(visitDate, "EEEE, MMMM d, yyyy")}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3" />
                          {restaurant.location}
                          {restaurant.cuisineType &&
                            ` • ${restaurant.cuisineType}`}
                        </div>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {restaurantPhotos.length > 0 ? (
                    <div className="space-y-2">
                      {restaurantPhotos.map((processedPhoto) => {
                        const totalPhotos = 1 + (processedPhoto.combinedPhotos?.length || 0);
                        return (
                          <div
                            key={processedPhoto.photoId}
                            className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                          >
                            {/* Photo thumbnail with count badge */}
                            <div className="relative flex-shrink-0">
                              <img
                                src={processedPhoto.previewUrl}
                                alt={processedPhoto.menuItemName}
                                className="w-16 h-16 object-cover rounded-md"
                              />
                              {totalPhotos > 1 && (
                                <div className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                                  {totalPhotos}
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0 pr-2">
                              <p className="font-medium text-gray-900 break-words">
                                {processedPhoto.menuItemName}
                              </p>
                              {processedPhoto.menuItemDescription && (
                                <p className="text-sm text-gray-500 mt-0.5">
                                  {processedPhoto.menuItemDescription}
                                </p>
                              )}
                              {processedPhoto.notes && (
                                <p className="text-xs text-gray-600 mt-1 italic">
                                  "{processedPhoto.notes}"
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-3 h-3 rounded-full ${
                                    RATING_COLORS[processedPhoto.rating - 1] ||
                                    "bg-gray-300"
                                  }`}
                                />
                                <span className="text-xs text-gray-600 whitespace-nowrap">
                                  {RATING_LABELS[processedPhoto.rating - 1] ||
                                    "Unknown"}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">
                      No items recorded
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          }
        )}
      </div>

      {/* Footer - Action Buttons */}
      {!isKeyboardVisible && (
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onEdit}
              disabled={isSubmitting}
              className="flex-1"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              onClick={onSubmitAll}
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

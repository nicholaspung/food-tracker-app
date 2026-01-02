import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, MapPin, Loader2, Lock, UserCheck } from "lucide-react";
import { QuickTrackPhotoData } from "@/types/photos";
import { RATING_COLORS, RATING_LABELS } from "@/lib/ratingConstants";
import { ITEM_CATEGORIES } from "@/constants/quickTrack";
import { format, parseISO } from "date-fns";

interface QuickTrackReviewScreenProps {
  quickTrackPhotos: QuickTrackPhotoData[];
  onEdit: () => void;
  onSubmitAll: () => void;
  isSubmitting: boolean;
  isKeyboardVisible: boolean;
}

/**
 * Quick Track Review Screen - Review all quick track items before submission
 */
export function QuickTrackReviewScreen({
  quickTrackPhotos,
  onEdit,
  onSubmitAll,
  isSubmitting,
  isKeyboardVisible,
}: QuickTrackReviewScreenProps) {
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b-2 border-blue-500 px-4 py-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="bg-blue-100 p-1.5 rounded">
            <Check className="h-4 w-4 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Review Quick Track Items
          </h1>
        </div>
        <p className="text-sm text-gray-500 mt-1 ml-8">
          {quickTrackPhotos.length} item
          {quickTrackPhotos.length !== 1 ? "s" : ""} ready to save
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
        {quickTrackPhotos.map((item) => (
          <Card key={item.photoId} className="border-gray-200 bg-gray-50/50">
            <CardContent>
              {/* Header with title and visibility - matches QuickTrackCard */}
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2 flex-1">
                  <p className="font-medium text-gray-900 break-words">
                    {item.itemName}
                  </p>
                  {/* Visibility indicator */}
                  <div
                    className="flex items-center gap-1"
                    title={
                      item.visibility === "friends"
                        ? "Shared with friends"
                        : "Private"
                    }
                  >
                    {item.visibility === "friends" ? (
                      <UserCheck className="w-4 h-4 text-green-600" />
                    ) : (
                      <Lock className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Date - matching RestaurantReviewScreen style */}
              {item.date && (
                <div className="flex items-center gap-1 text-orange-700 font-semibold text-sm mb-3">
                  📅 {format(parseISO(item.date), "EEEE, MMMM d, yyyy")}
                </div>
              )}

              <div className="flex items-start gap-3">
                {/* Photo thumbnail */}
                <img
                  src={item.previewUrl}
                  alt={item.itemName}
                  className="w-16 h-16 object-cover rounded-md flex-shrink-0"
                />

                <div className="flex-1 min-w-0 pr-2">
                  {/* Category badge */}
                  {item.category && (
                    <Badge
                      variant="secondary"
                      className="text-xs bg-gray-200 text-gray-700"
                    >
                      {ITEM_CATEGORIES.find((c) => c.value === item.category)
                        ?.label || item.category.replace(/_/g, " ")}
                    </Badge>
                  )}

                  {/* Location */}
                  {item.locationText && (
                    <p className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                      <MapPin className="w-3 h-3" />
                      {item.locationText}
                    </p>
                  )}

                  {/* Notes */}
                  {item.notes && (
                    <p className="text-xs text-gray-600 mt-1 italic">
                      "{item.notes}"
                    </p>
                  )}
                </div>

                {/* Rating - right side like QuickTrackCard */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        RATING_COLORS[item.rating - 1] || "bg-gray-300"
                      }`}
                    />
                    <span className="text-xs text-gray-600 whitespace-nowrap">
                      {RATING_LABELS[item.rating - 1] || "Unknown"}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer */}
      {!isKeyboardVisible && (
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex gap-3">
            <Button variant="outline" onClick={onEdit} className="flex-1">
              Edit
            </Button>
            <Button
              onClick={onSubmitAll}
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? "Saving..." : "Save All Items"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

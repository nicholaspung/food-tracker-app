import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Calendar, MapPin, Loader2 } from "lucide-react";
import { QuickTrackPhotoData } from "@/types/photos";
import { RATING_COLORS, RATING_LABELS } from "@/lib/ratingConstants";
import { ITEM_CATEGORIES } from "@/components/QuickTrackPage";
import { format } from "date-fns";

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
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {quickTrackPhotos.map((item) => (
          <Card key={item.photoId}>
            <CardContent className="p-4">
              <div className="flex gap-3">
                {/* Photo */}
                <img
                  src={item.previewUrl}
                  alt={item.itemName}
                  className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                />

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {item.itemName}
                  </h3>
                  {item.captureDate && (
                    <div className="flex items-center gap-1 text-xs text-orange-700 font-semibold mt-1">
                      <Calendar className="w-3 h-3" />
                      {format(item.captureDate, "EEEE, MMM d, yyyy")}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        RATING_COLORS[item.rating - 1] || "bg-gray-300"
                      }`}
                    />
                    <span className="text-sm text-gray-600">
                      {RATING_LABELS[item.rating - 1] || "Unknown"}
                    </span>
                  </div>
                  {item.category && (
                    <p className="text-xs text-gray-500 mt-1">
                      {ITEM_CATEGORIES.find((c) => c.value === item.category)
                        ?.label || item.category}
                    </p>
                  )}
                  {item.locationText && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" />
                      {item.locationText}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-xs text-gray-600 mt-1 italic line-clamp-2">
                      "{item.notes}"
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {item.visibility === "friends"
                      ? "Visible to friends"
                      : "Private"}
                  </p>
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

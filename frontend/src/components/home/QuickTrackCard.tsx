import { memo } from "react";
import { pb, type FoodItem } from "@/lib/pocketbase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Pencil,
  Trash2,
  Share2,
  Lock,
  UserCheck,
} from "lucide-react";
import { RATING_LABELS, RATING_COLORS } from "@/lib/ratingConstants";

interface VisitPhoto {
  id: string;
  visit: string;
  food_item: string;
  user: string;
  photo: string;
  created: string;
  updated: string;
  isPending?: boolean;
}

interface QuickTrackCardProps {
  item: FoodItem;
  photo?: VisitPhoto;
  onEdit: (itemId: string) => void;
  onDelete: (item: FoodItem) => void;
  onSharePhoto: (photo: VisitPhoto, item: FoodItem) => void;
  onPhotoClick: (photo: { url: string; dishName: string }) => void;
}

const QuickTrackCard = memo(function QuickTrackCard({
  item,
  photo,
  onEdit,
  onDelete,
  onSharePhoto,
  onPhotoClick,
}: QuickTrackCardProps) {
  const photoUrl = photo
    ? photo.isPending
      ? photo.photo
      : pb.files.getURL(photo, photo.photo, {
          thumb: "100x100",
        })
    : null;
  const fullPhotoUrl = photo
    ? photo.isPending
      ? photo.photo
      : pb.files.getURL(photo, photo.photo)
    : null;

  return (
    <Card
      className="border-gray-200 bg-gray-50/50"
    >
      <CardContent>
        {/* Header with title and action buttons */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-1">
            <p className="font-medium text-gray-900 break-words">
              {item.name}
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

          {/* Edit and Delete buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(item.id)}
              data-testid={`edit-quick-track-${item.id}`}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(item)}
              data-testid={`delete-quick-track-${item.id}`}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-3">
          {/* Photo thumbnail */}
          {photoUrl && photo && fullPhotoUrl && (
            <img
              src={photoUrl}
              alt={item.name}
              className="w-16 h-16 object-cover rounded-md flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() =>
                onPhotoClick({
                  url: fullPhotoUrl,
                  dishName: item.name,
                })
              }
            />
          )}

          <div className="flex-1 min-w-0 pr-2">
            {/* Category badge */}
            {item.itemCategory && (
              <Badge
                variant="secondary"
                className="text-xs bg-gray-200 text-gray-700"
              >
                {item.itemCategory.replace(/_/g, " ")}
              </Badge>
            )}

            {/* Location */}
            {item.location_text && (
              <p className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                <MapPin className="w-3 h-3" />
                {item.location_text}
              </p>
            )}

            {/* Notes */}
            {item.notes && (
              <p className="text-xs text-gray-600 mt-1 italic">
                "{item.notes}"
              </p>
            )}
          </div>

          {/* Rating and Share - right side like VisitCard */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  RATING_COLORS[item.rating - 1] ||
                  "bg-gray-300"
                }`}
              />
              <span className="text-xs text-gray-600 whitespace-nowrap">
                {RATING_LABELS[item.rating - 1] || "Unknown"}
              </span>
            </div>

            {/* Share button - only show if there's a photo */}
            {photo && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSharePhoto(photo, item);
                }}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                title="Share photo"
              >
                <Share2 className="w-3 h-3" />
                <span>Share</span>
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

export default QuickTrackCard;

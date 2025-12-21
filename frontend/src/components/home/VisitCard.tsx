import { memo, useMemo } from "react";
import { pb, type Restaurant, type FoodItem } from "@/lib/pocketbase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Pencil,
  Trash2,
  Users,
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

interface VisitWithDetails {
  id: string;
  restaurant?: Restaurant;
  user: string;
  visitDate: string;
  visibility: 'private' | 'friends';
  notes?: string;
  created: string;
  updated: string;
  foodItems?: FoodItem[];
}

interface VisitCardProps {
  visit: VisitWithDetails;
  isFriend: boolean;
  friendName?: string | null;
  visitPhotos: VisitPhoto[];
  onEdit?: (visitId: string) => void;
  onDelete: (visit: VisitWithDetails) => void;
  onSharePhoto: (photo: VisitPhoto, foodItem: FoodItem, restaurant: Restaurant, visitDate: string) => void;
  onShareVisit: (visit: VisitWithDetails) => void;
  onPhotoClick: (photo: { url: string; dishName: string }) => void;
  ratingFilter?: "all" | "1" | "2" | "3" | "4" | "5";
}

const VisitCard = memo(function VisitCard({
  visit,
  isFriend,
  friendName,
  visitPhotos,
  onEdit,
  onDelete,
  onSharePhoto,
  onShareVisit,
  onPhotoClick,
  ratingFilter = "all",
}: VisitCardProps) {
  // Create a Map for O(1) photo lookups by food_item ID
  const visitPhotosByFoodItem = useMemo(() => {
    const map = new Map<string, VisitPhoto>();
    visitPhotos.forEach((photo) => {
      if (photo.food_item) {
        map.set(photo.food_item, photo);
      }
    });
    return map;
  }, [visitPhotos]);

  // Filter food items based on rating filter
  const filteredFoodItems = useMemo(() => {
    if (!visit.foodItems) return [];
    if (ratingFilter === "all") return visit.foodItems;

    const targetRating = parseInt(ratingFilter);
    return visit.foodItems.filter((item) => item.rating === targetRating);
  }, [visit.foodItems, ratingFilter]);

  return (
    <Card
      className={
        isFriend
          ? "border-blue-200 bg-blue-50/30 gap-0"
          : "gap-0"
      }
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">
                {visit.restaurant?.name}
              </CardTitle>
              {isFriend && (
                <Badge
                  variant="outline"
                  className="text-xs border-blue-300 text-blue-700"
                >
                  <Users className="w-3 h-3 mr-1" />
                  {friendName}
                </Badge>
              )}
              {!isFriend && (
                <div
                  className="flex items-center gap-1"
                  title={
                    visit.visibility === "friends"
                      ? "Shared with friends"
                      : "Private"
                  }
                >
                  {visit.visibility === "friends" ? (
                    <UserCheck className="w-4 h-4 text-green-600" />
                  ) : (
                    <Lock className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              )}
            </div>
            <CardDescription className="flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3" />
              {visit.restaurant?.location}
              {visit.restaurant?.cuisineType &&
                ` • ${visit.restaurant.cuisineType}`}
            </CardDescription>
          </div>
          {!isFriend && (
            <div className="flex items-center gap-1">
              {/* Share Visit button - only show if visit has 2 or more photos */}
              {(() => {
                const photosForVisit =
                  visitPhotos.filter((photo) =>
                    visit.foodItems?.some(
                      (item) =>
                        item.id === photo.food_item
                    )
                  );
                return photosForVisit.length >= 2;
              })() && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onShareVisit(visit)}
                  data-testid={`share-visit-${visit.id}`}
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  title="Share all photos from this visit"
                >
                  <Share2 className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit?.(visit.id)}
                data-testid={`edit-visit-${visit.id}`}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(visit)}
                data-testid={`delete-visit-${visit.id}`}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {filteredFoodItems.length > 0 ? (
          <div className="space-y-2">
            {filteredFoodItems.map((item) => {
              // Find photo for this food item
              const photo = visitPhotosByFoodItem.get(item.id);
              // For offline photos (isPending), use the blob URL directly
              // For online photos, use PocketBase file URL
              const photoUrl = photo
                ? photo.isPending
                  ? photo.photo // Blob URL for offline photos
                  : pb.files.getURL(
                      photo,
                      photo.photo,
                      { thumb: "100x100" }
                    )
                : null;
              const fullPhotoUrl = photo
                ? photo.isPending
                  ? photo.photo // Blob URL for offline photos
                  : pb.files.getURL(photo, photo.photo)
                : null;

              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  {/* Photo thumbnail */}
                  {photoUrl &&
                    photo &&
                    fullPhotoUrl && (
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
                    <p className="font-medium text-gray-900 break-words">
                      {item.name}
                    </p>
                    {item.description && (
                      <p className="text-sm text-gray-500 mt-0.5">
                        {item.description}
                      </p>
                    )}
                    {item.notes && (
                      <p className="text-xs text-gray-600 mt-1 italic">
                        "{item.notes}"
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          RATING_COLORS[
                            item.rating - 1
                          ] || "bg-gray-300"
                        }`}
                      />
                      <span className="text-xs text-gray-600 whitespace-nowrap">
                        {RATING_LABELS[
                          item.rating - 1
                        ] || "Unknown"}
                      </span>
                    </div>
                    {/* Share button - only show if there's a photo */}
                    {photo && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSharePhoto(
                            photo,
                            item,
                            visit.restaurant!,
                            visit.visitDate
                          );
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
});

export default VisitCard;

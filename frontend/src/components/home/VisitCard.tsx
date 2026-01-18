import { memo, useMemo, useState } from "react";
import { pb, type Restaurant, type FoodItem } from "@/lib/pocketbase";
import { type VisitPhoto as RepoVisitPhoto } from "@/repositories";
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
  ArrowRightLeft,
} from "lucide-react";
import { RATING_LABELS, RATING_COLORS } from "@/lib/ratingConstants";
import { useLongPress } from "@/hooks/ui/useLongPress";
import { ContextMenu } from "@/components/ui/ContextMenu";

type VisitPhoto = RepoVisitPhoto & { isPending?: boolean };

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
  visitPhotosByFoodItem: Map<string, RepoVisitPhoto>;
  onEdit?: (visitId: string) => void;
  onDelete: (visit: VisitWithDetails) => void;
  onSharePhoto: (photo: VisitPhoto, foodItem: FoodItem, restaurant: Restaurant, visitDate: string) => void;
  onShareVisit: (visit: VisitWithDetails) => void;
  onPhotoClick: (data: { urls: string[]; dishName: string; initialIndex?: number }) => void;
  onMoveItem?: (foodItem: FoodItem, visitId: string) => void;
  ratingFilter?: "all" | "1" | "2" | "3" | "4" | "5";
  showVisibilityIndicator?: boolean;
}

// Sub-component for food item row with long-press support
interface FoodItemRowProps {
  item: FoodItem;
  photos: VisitPhoto[];
  photoUrls: string[];
  fullPhotoUrls: string[];
  onPhotoClick: (data: { urls: string[]; dishName: string; initialIndex?: number }) => void;
  onSharePhoto: () => void;
  onLongPress: () => void;
  enableLongPress: boolean;
}

const FoodItemRow = memo(function FoodItemRow({
  item,
  photos,
  photoUrls,
  fullPhotoUrls,
  onPhotoClick,
  onSharePhoto,
  onLongPress,
  enableLongPress,
}: FoodItemRowProps) {
  const longPressHandlers = useLongPress({
    threshold: 500,
    onLongPress: enableLongPress ? onLongPress : () => {},
  });

  const hasPhotos = photoUrls.length > 0;
  const photoCount = photoUrls.length;

  return (
    <div
      key={item.id}
      className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg select-none"
      {...(enableLongPress ? longPressHandlers : {})}
    >
      {/* Photo thumbnail with count badge */}
      {hasPhotos && (
        <div
          className="relative w-16 h-16 flex-shrink-0 cursor-pointer"
          onClick={() =>
            onPhotoClick({
              urls: fullPhotoUrls,
              dishName: item.name,
              initialIndex: 0,
            })
          }
        >
          <img
            src={photoUrls[0]}
            alt={item.name}
            className="w-16 h-16 object-cover rounded-md hover:opacity-80 transition-opacity"
          />
          {photoCount > 1 && (
            <div className="absolute top-0.5 left-0.5 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
              +{photoCount - 1}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-w-0 pr-2">
        <p className="font-medium text-gray-900 break-words">{item.name}</p>
        {item.description && (
          <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
        )}
        {item.notes && (
          <p className="text-xs text-gray-600 mt-1 italic">"{item.notes}"</p>
        )}
      </div>
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
        {/* Share button - only show if there are photos */}
        {hasPhotos && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSharePhoto();
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
});

const VisitCard = memo(function VisitCard({
  visit,
  isFriend,
  friendName,
  visitPhotosByFoodItem,
  onEdit,
  onDelete,
  onSharePhoto,
  onShareVisit,
  onPhotoClick,
  onMoveItem,
  ratingFilter = "all",
  showVisibilityIndicator = true,
}: VisitCardProps) {
  // State for context menu
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);

  const handleLongPress = (item: FoodItem) => {
    setSelectedItem(item);
    setShowContextMenu(true);
  };

  const handleMoveItem = () => {
    if (selectedItem && onMoveItem) {
      onMoveItem(selectedItem, visit.id);
    }
    setShowContextMenu(false);
    setSelectedItem(null);
  };
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
              {!isFriend && showVisibilityIndicator && (
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
                const photosCount = visit.foodItems?.reduce((count, item) => {
                  return visitPhotosByFoodItem.has(item.id) ? count + 1 : count;
                }, 0) || 0;
                return photosCount >= 2;
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
              const photo = visitPhotosByFoodItem.get(item.id) as VisitPhoto | undefined;
              // For offline photos (isPending), use the blob URL directly
              // For online photos, use PocketBase file URL
              const photoUrls = photos.map((photo) =>
                photo.isPending
                  ? photo.photo // Blob URL for offline photos
                  : pb.files.getURL(photo, photo.photo, { thumb: "100x100" })
              );
              const fullPhotoUrls = photos.map((photo) =>
                photo.isPending
                  ? photo.photo // Blob URL for offline photos
                  : pb.files.getURL(photo, photo.photo)
              );

              return (
                <FoodItemRow
                  key={item.id}
                  item={item}
                  photos={photos}
                  photoUrls={photoUrls}
                  fullPhotoUrls={fullPhotoUrls}
                  onPhotoClick={onPhotoClick}
                  onSharePhoto={() => photos.length > 0 && onSharePhoto(photos[0], item, visit.restaurant!, visit.visitDate)}
                  onLongPress={() => handleLongPress(item)}
                  enableLongPress={!isFriend && !!onMoveItem}
                />
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">
            No items recorded
          </p>
        )}
      </CardContent>

      {/* Context menu for food item actions */}
      <ContextMenu
        open={showContextMenu}
        onOpenChange={setShowContextMenu}
        title={selectedItem?.name}
        options={[
          {
            label: 'Move to another visit',
            icon: ArrowRightLeft,
            onClick: handleMoveItem,
          },
        ]}
      />
    </Card>
  );
});

export default VisitCard;

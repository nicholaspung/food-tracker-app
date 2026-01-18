import { memo } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IWentThereButton } from "./IWentThereButton";
import { MapPin, Users, Trash2, Bookmark } from "lucide-react";
import { RATING_LABELS, RATING_COLORS } from "@/lib/ratingConstants";
import { GroupedRestaurant, UserReviewData } from "./types";
import { ListItem, FoodItem } from "@/lib/pocketbase";

interface RestaurantGroupCardProps {
  group: GroupedRestaurant;
  index: number;
  isOwner: boolean;
  onDeleteItem: (item: ListItem) => void;
  onSaveItem: (item: ListItem, foodItem: FoodItem) => void;
  onRemoveItem: (item: ListItem) => void;
  onViewReview: (data: UserReviewData) => void;
  hasSavedFoodItem: (foodItemId: string) => boolean;
}

const RestaurantGroupCard = memo(({
  group,
  index,
  isOwner,
  onDeleteItem,
  onSaveItem,
  onRemoveItem,
  onViewReview,
  hasSavedFoodItem
}: RestaurantGroupCardProps) => {
  // Common header part
  const renderHeader = () => (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-gray-500">
          {index + 1}.
        </span>
        <CardTitle className="text-lg">
          {group.restaurant.name}
        </CardTitle>
      </div>
      <CardDescription className="flex items-center gap-1">
        <MapPin className="w-3 h-3" />
        {group.restaurant.location}
        {group.restaurant.cuisineType && ` • ${group.restaurant.cuisineType}`}
      </CardDescription>
    </div>
  );

  if (isOwner) {
    /* Owner View - Grouped by restaurant with friend attribution and per-item delete */
    return (
      <Card
        className="transition-shadow hover:shadow-md"
        data-testid={`list-item-${group.restaurant.id}`}
      >
        <CardHeader>
          <div className="flex-1">
            {renderHeader()}

            {/* Bookmarked Items - grouped by source with delete buttons per item */}
            {group.itemsBySource.some(s => s.items.length > 0) && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-700 mb-2">
                  Bookmarked Items:
                </p>
                <div className="space-y-2">
                  {group.itemsBySource.flatMap((sourceGroup) => {
                    if (sourceGroup.items.length === 0) return [];
                    const friendName = sourceGroup.sourceUser
                      ? (sourceGroup.sourceUser.name || sourceGroup.sourceUser.email?.split("@")[0])
                      : null;

                    return sourceGroup.items.map(({ listItem, foodItem }) => {
                      const visitDate = foodItem.expand?.visit?.visitDate;
                      const userFoodItem = listItem.expand?.userFoodItem;
                      const userVisitDate = userFoodItem?.expand?.visit?.visitDate;
                      return (
                        <div key={listItem.id} className="space-y-1">
                          {/* Friend's item: friend · item · rating · date */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-sm flex-1 min-w-0">
                              {friendName && (
                                <>
                                  <Badge
                                    variant="outline"
                                    className="text-xs border-blue-300 text-blue-700 flex-shrink-0"
                                  >
                                    <Users className="w-3 h-3 mr-1" />
                                    {friendName}
                                  </Badge>
                                  <span className="text-gray-300">·</span>
                                </>
                              )}
                              <span className="text-gray-900 truncate">{foodItem.name}</span>
                              <span className="text-gray-300">·</span>
                              <Badge
                                className={`${
                                  RATING_COLORS[foodItem.rating - 1] || "bg-gray-500"
                                } text-white text-xs flex-shrink-0`}
                              >
                                {RATING_LABELS[foodItem.rating - 1] || "Unknown"}
                              </Badge>
                              {visitDate && (
                                <>
                                  <span className="text-gray-300">·</span>
                                  <span className="text-xs text-gray-400 flex-shrink-0">
                                    {new Date(visitDate).toLocaleDateString(undefined, {
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {!userFoodItem && group.restaurant && (
                                <IWentThereButton
                                  listItem={listItem}
                                  foodItem={foodItem}
                                  restaurant={group.restaurant}
                                />
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteItem(listItem);
                                }}
                                className="p-1 h-6 w-6"
                                title="Remove this item"
                                data-testid={`delete-item-${listItem.id}`}
                              >
                                <Trash2 className="w-3 h-3 text-red-600" />
                              </Button>
                            </div>
                          </div>

                          {/* User's rating - subtle inline row */}
                          {userFoodItem && group.restaurant && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewReview({
                                  foodItem: userFoodItem,
                                  restaurant: group.restaurant,
                                  visitDate: userVisitDate,
                                });
                              }}
                              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-1 py-0.5 ml-2 transition-colors"
                            >
                              <span className="text-blue-400">↳</span>
                              <span>You</span>
                              <span className="text-blue-300">·</span>
                              <Badge
                                className={`${
                                  RATING_COLORS[userFoodItem.rating - 1] || "bg-gray-500"
                                } text-white text-[10px] px-1.5 py-0`}
                              >
                                {RATING_LABELS[userFoodItem.rating - 1] || "Unknown"}
                              </Badge>
                              {userVisitDate && (
                                <>
                                  <span className="text-blue-300">·</span>
                                  <span className="text-blue-400">
                                    {new Date(userVisitDate).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })}
                                  </span>
                                </>
                              )}
                              <span className="text-blue-300 ml-1">→</span>
                            </button>
                          )}
                        </div>
                      );
                    });
                  })}
                </div>
              </div>
            )}

            {/* Notes - grouped by source */}
            {group.itemsBySource.some(s => s.notes.length > 0) && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-700 mb-2">
                  Notes:
                </p>
                <div className="space-y-2">
                  {group.itemsBySource.map((sourceGroup, idx) => {
                    if (sourceGroup.notes.length === 0) return null;
                    const friendName = sourceGroup.sourceUser
                      ? (sourceGroup.sourceUser.name || sourceGroup.sourceUser.email?.split("@")[0])
                      : null;

                    return sourceGroup.notes.map((note, noteIdx) => (
                      <div key={`${sourceGroup.sourceUser?.id || 'self'}-note-${idx}-${noteIdx}`} className="flex items-start gap-2">
                        {friendName && (
                          <Badge
                            variant="outline"
                            className="text-xs border-blue-300 text-blue-700 flex-shrink-0"
                          >
                            <Users className="w-3 h-3 mr-1" />
                            {friendName}
                          </Badge>
                        )}
                        <p className="text-sm text-gray-700 italic">
                          "{note}"
                        </p>
                      </div>
                    ));
                  })}
                </div>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>
    );
  }

  // Non-owner view
  const allItems = group.itemsBySource.flatMap(s => s.items);
  const allNotes = group.itemsBySource.flatMap(s => s.notes);

  return (
    <Card
      className="transition-shadow hover:shadow-md"
      data-testid={`list-item-${group.restaurant.id}`}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            {renderHeader()}

            {/* Recommended Items with individual bookmark buttons */}
            {allItems.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-700 mb-2">
                  Recommended Items:
                </p>
                <div className="space-y-1.5">
                  {allItems.map(({ listItem, foodItem }) => {
                    const visitDate = foodItem.expand?.visit?.visitDate;
                    const isAlreadySaved = hasSavedFoodItem(foodItem.id);

                    return (
                      <div
                        key={`${listItem.id}-${foodItem.id}`}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 text-sm flex-wrap flex-1 min-w-0">
                          <span className="text-gray-900 font-medium truncate">
                            {foodItem.name}
                          </span>
                          <Badge
                            className={`${
                              RATING_COLORS[foodItem.rating - 1] || "bg-gray-500"
                            } text-white text-xs flex-shrink-0`}
                          >
                            {RATING_LABELS[foodItem.rating - 1] || "Unknown"}
                          </Badge>
                          {visitDate && (
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {new Date(visitDate).toLocaleDateString(undefined, {
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isAlreadySaved) {
                              onRemoveItem(listItem);
                            } else {
                              onSaveItem(listItem, foodItem);
                            }
                          }}
                          className="p-1 h-6 w-6 flex-shrink-0"
                          data-testid={`save-item-${foodItem.id}`}
                        >
                          <Bookmark
                            className={`w-4 h-4 ${
                              isAlreadySaved
                                ? 'fill-blue-600 text-blue-600'
                                : 'text-gray-600'
                            }`}
                          />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            {allNotes.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                {allNotes.map((note, noteIdx) => (
                  <p key={noteIdx} className="text-sm text-gray-700 italic">
                    "{note}"
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
});

RestaurantGroupCard.displayName = "RestaurantGroupCard";

export default RestaurantGroupCard;

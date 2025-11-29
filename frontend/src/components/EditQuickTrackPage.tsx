import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp, Loader2, Users, Calendar } from "lucide-react";
import { RATING_OPTIONS } from "@/lib/ratingConstants";
import MenuItemPhotoInput from "@/components/MenuItemPhotoInput";
import { useOfflineQuickTrackUpdate } from "@/hooks/useOfflineQuickTrackUpdate";
import { useSync } from "@/contexts/SyncContext";
import { useScrollIntoView } from "@/hooks/useScrollIntoView";
import { useKeyboardVisible } from "@/hooks/useKeyboardVisible";
import { pb } from "@/lib/pocketbase";
import {
  getTodayLocalDateString,
  formatLocalDateForDisplay,
  utcToLocalDateString,
  localDateStringToUTC,
} from "@/lib/dateUtils";
import { ITEM_CATEGORIES } from "@/components/QuickTrackPage";

interface EditQuickTrackPageProps {
  itemId: string;
}

export default function EditQuickTrackPage({ itemId }: EditQuickTrackPageProps) {
  const navigate = useNavigate();

  // Fetch the quick track item
  const { data: item, isLoading: itemLoading } = useQuery({
    queryKey: ["quickTrackItem", itemId],
    queryFn: async () => {
      return await pb.collection("food_items").getOne(itemId);
    },
  });

  // Fetch existing photo if any
  const { data: visitPhotos = [] } = useQuery({
    queryKey: ["allVisitPhotos"],
    queryFn: async () => {
      return await pb.collection("visit_photos").getFullList({
        sort: "-created",
      });
    },
  });

  const existingPhoto = visitPhotos.find((p: any) => p.food_item === itemId);

  // Form state
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [rating, setRating] = useState<number | null>(3);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string>("");
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [locationText, setLocationText] = useState("");
  const [notes, setNotes] = useState("");
  const [itemDate, setItemDate] = useState(getTodayLocalDateString());
  const [showDateEdit, setShowDateEdit] = useState(false);
  const [visibility, setVisibility] = useState<"friends" | "private">(
    "friends"
  );

  // UI state
  const hasRatedBefore = localStorage.getItem("hasRatedBefore") === "true";
  const [isLegendExpanded, setIsLegendExpanded] = useState(!hasRatedBefore);

  // Refs for auto-scrolling
  const itemNameInputRef = useScrollIntoView<HTMLInputElement>();
  const notesInputRef = useScrollIntoView<HTMLTextAreaElement>();

  // Offline-aware Quick Track Update
  const { isOnline } = useSync();
  const updateItemMutation = useOfflineQuickTrackUpdate();
  const isKeyboardVisible = useKeyboardVisible();

  // Populate form when item loads
  useEffect(() => {
    if (item) {
      setItemName(item.name || "");
      // Set category with proper type - undefined for no category
      setCategory(item.itemCategory || undefined);
      setRating(item.rating || 3);
      setLocationText(item.location_text || "");
      setNotes(item.notes || "");
      setVisibility(item.visibility || "private");

      // Set item date from itemDate field, fallback to created timestamp for old items
      if (item.itemDate) {
        setItemDate(utcToLocalDateString(item.itemDate));
      } else if (item.created) {
        setItemDate(utcToLocalDateString(item.created));
      }

      // Set existing photo preview
      if (existingPhoto) {
        const photoUrl = pb.files.getURL(existingPhoto, existingPhoto.photo);
        setPhotoPreviewUrl(photoUrl);
      }
    }
  }, [item, existingPhoto]);

  const handlePhotoCapture = useCallback((_key: string | number, file: File) => {
    setPhoto(file);
    setRemoveExistingPhoto(false);

    // Create preview URL
    setPhotoPreviewUrl((prevUrl) => {
      if (prevUrl && !existingPhoto) {
        URL.revokeObjectURL(prevUrl);
      }
      return URL.createObjectURL(file);
    });
  }, [existingPhoto]);

  const handlePhotoRemove = useCallback((_key: string | number) => {
    setPhotoPreviewUrl((prevUrl) => {
      if (prevUrl && !existingPhoto) {
        URL.revokeObjectURL(prevUrl);
      }
      return "";
    });
    setPhoto(null);

    // Mark existing photo for removal
    if (existingPhoto) {
      setRemoveExistingPhoto(true);
    }
  }, [existingPhoto]);

  const handleUpdateItem = async () => {
    if (!itemName.trim() || rating === null) {
      return;
    }

    // Get GPS coordinates if available and location text is provided
    let latitude: number | undefined;
    let longitude: number | undefined;

    if (navigator.geolocation && locationText.trim()) {
      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5000,
              maximumAge: 300000, // 5 minutes
            });
          }
        );
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      } catch (error) {
        console.log("Could not get GPS location:", error);
      }
    }

    try {
      await updateItemMutation.mutateAsync({
        id: itemId,
        name: itemName,
        rating: rating,
        notes: notes || undefined,
        itemCategory: category || undefined,
        location_text: locationText || undefined,
        latitude,
        longitude,
        itemDate: itemDate ? localDateStringToUTC(itemDate) : undefined,
        photo: removeExistingPhoto ? null : (photo || undefined),
        existingPhotoId: existingPhoto?.id,
        visibility,
      });

      // Success
      navigate({ to: "/home" });
    } catch (error: any) {
      console.error("Failed to update quick track item:", error);

      // Show helpful message if offline
      if (!isOnline && error.message?.includes("queued")) {
        alert(
          "You're offline. Your changes have been saved and will sync when you're back online."
        );
        navigate({ to: "/home" });
      }
    }
  };

  const isSubmitDisabled =
    !itemName.trim() || rating === null || updateItemMutation.isPending;

  const isLoading = updateItemMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleUpdateItem();
  };

  if (itemLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-gray-600">Item not found</p>
          <Button
            onClick={() => navigate({ to: "/home" })}
            className="mt-4"
            variant="outline"
          >
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Edit Quick Track Item</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date picker */}
          {itemDate && (
            <div>
              {!showDateEdit ? (
                <div
                  className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => setShowDateEdit(true)}
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-900">
                      {formatLocalDateForDisplay(itemDate)}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">Tap to change</span>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-white border border-gray-200 space-y-2">
                  <Label className="text-xs text-gray-600">Date</Label>
                  <Input
                    type="date"
                    value={itemDate}
                    onChange={(e) => setItemDate(e.target.value)}
                    max={getTodayLocalDateString()}
                    className="text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDateEdit(false)}
                    className="w-full"
                  >
                    Done
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Visibility Section */}
          <div className="p-3 bg-white rounded-lg border border-gray-200">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={visibility === "friends"}
                onChange={(e) =>
                  setVisibility(e.target.checked ? "friends" : "private")
                }
                disabled={isLoading}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium">
                    Friends can view this item
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {visibility === "friends"
                    ? "Your friends will be able to see this quick track item"
                    : "Only you will be able to see this item"}
                </p>
              </div>
            </label>
          </div>

          {/* Item Name and Photo Section */}
          <Card>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="itemName" className="font-semibold">
                  Item Name *
                </Label>
                <Input
                  ref={itemNameInputRef}
                  id="itemName"
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="e.g., Chocolate Bar, Coffee, Homemade Pasta"
                  maxLength={200}
                  required
                  disabled={isLoading}
                />
              </div>

              <MenuItemPhotoInput
                photoKey="quick-track-edit"
                newPhotoPreviewUrl={photoPreviewUrl}
                onPhotoCapture={handlePhotoCapture}
                onRemoveNewPhoto={handlePhotoRemove}
                showLabel={true}
                showNewPhotoBadge={false}
              />
            </CardContent>
          </Card>

          {/* Collapsible Rating Legend */}
          <Card className="border-2 border-blue-200 bg-blue-50/30 py-4">
            <CardContent className="px-4">
              <button
                type="button"
                onClick={() => setIsLegendExpanded(!isLegendExpanded)}
                className="w-full flex items-center justify-between"
              >
                <Label className="text-sm font-semibold text-gray-700 cursor-pointer">
                  Rating Guide
                </Label>
                {isLegendExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-600" />
                )}
              </button>
              {isLegendExpanded && (
                <div className="space-y-2 mt-3">
                  {RATING_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-center gap-3">
                      <div
                        className={`${option.color} text-white w-8 h-8 rounded-md flex items-center justify-center font-bold text-sm flex-shrink-0`}
                      >
                        {option.value}
                      </div>
                      <span className="text-sm text-gray-700">
                        {option.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rating Section */}
          <Card>
            <CardContent className="space-y-3">
              <div>
                <Label className="font-semibold">Rating *</Label>
                <div className="grid grid-cols-5 gap-2 mt-2">
                  {RATING_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRating(option.value)}
                      disabled={isLoading}
                      className={`p-3 rounded-lg text-white text-center text-xs font-medium transition-all ${
                        option.color
                      } ${
                        rating === option.value
                          ? "ring-2 ring-offset-2 ring-blue-500"
                          : "opacity-60 hover:opacity-100"
                      }`}
                    >
                      {option.value}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-2 text-center">
                  {RATING_OPTIONS.find((o) => o.value === rating)?.label}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Category, Location, and Notes Section */}
          <Card>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="category" className="font-semibold">
                  Category (Optional)
                </Label>
                <Select
                  key={`category-${itemId}`}
                  value={category}
                  onValueChange={setCategory}
                  disabled={isLoading}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location" className="font-semibold">
                  Location (Optional)
                </Label>
                <Input
                  id="location"
                  type="text"
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  placeholder="e.g., 7-Eleven on Main St, Trader Joe's"
                  maxLength={200}
                  disabled={isLoading}
                />
                <p className="text-xs text-gray-600">
                  GPS coordinates will be automatically captured if available
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="font-semibold">
                  Notes (Optional)
                </Label>
                <Textarea
                  id="notes"
                  ref={notesInputRef}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional thoughts or details..."
                  maxLength={1000}
                  rows={3}
                  disabled={isLoading}
                  className="resize-none"
                />
              </div>
            </CardContent>
          </Card>

          {/* Error Display */}
          {updateItemMutation.isError &&
            !updateItemMutation.error?.message?.includes("queued") && (
              <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
                <p className="font-semibold">Error updating item</p>
                <p className="text-sm">
                  Please try again. Check browser console for details.
                </p>
              </div>
            )}
        </form>
      </div>

      {/* Bottom Action Buttons */}
      {!isKeyboardVisible && (
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/home" })}
              className="flex-1"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateItem}
              disabled={isSubmitDisabled}
              className="flex-1"
            >
              {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              {isLoading ? "Updating..." : "Update Item"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

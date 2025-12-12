import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useFoodItem } from "@/hooks/api/useFoodItems";
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
import { Loader2 } from "lucide-react";
import MenuItemPhotoInput from "@/components/MenuItemPhotoInput";
import { RatingSelector } from "@/components/ui/RatingSelector";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { VisibilityToggle } from "@/components/ui/VisibilityToggle";
import { RatingLegend } from "@/components/ui/RatingLegend";
import { useOfflineQuickTrackUpdate } from "@/hooks/useOfflineQuickTrackUpdate";
import { useSync } from "@/contexts/SyncContext";
import { useScrollIntoView } from "@/hooks/useScrollIntoView";
import { useKeyboardVisible } from "@/hooks/useKeyboardVisible";
import { pb } from "@/lib/pocketbase";
import {
  getTodayLocalDateString,
  utcToLocalDateString,
  localDateStringToUTC,
} from "@/lib/dateUtils";
import { ITEM_CATEGORIES } from "@/components/QuickTrackPage";
import { usePhotoManager } from "@/hooks/usePhotoManager";
import { useErrorHandler } from '@/hooks/useErrorHandler';

interface EditQuickTrackPageProps {
  itemId: string;
}

export default function EditQuickTrackPage({ itemId }: EditQuickTrackPageProps) {
  const navigate = useNavigate();
  const { showSuccess } = useErrorHandler({ source: 'EditQuickTrackPage', autoClearMs: 5000 });

  // Fetch the quick track item
  const { data: item, isLoading: itemLoading } = useFoodItem(itemId);

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

  // Photo management hook
  const {
    photo,
    previewUrl: photoPreviewUrl,
    handleCapture,
    handleRemove,
  } = usePhotoManager();

  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [locationText, setLocationText] = useState("");
  const [notes, setNotes] = useState("");
  const [itemDate, setItemDate] = useState(getTodayLocalDateString());
  const [visibility, setVisibility] = useState<"friends" | "private">(
    "friends"
  );

  // UI state
  const hasRatedBefore = localStorage.getItem("hasRatedBefore") === "true";

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
    }
  }, [item]);

  const handlePhotoCapture = useCallback(
    (_key: string | number, file: File) => {
      handleCapture(file);
      setRemoveExistingPhoto(false);
    },
    [handleCapture]
  );

  const handlePhotoRemove = useCallback(
    (_key: string | number) => {
      handleRemove();

      // Mark existing photo for removal
      if (existingPhoto) {
        setRemoveExistingPhoto(true);
      }
    },
    [handleRemove, existingPhoto]
  );

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
        showSuccess(
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
          <DatePickerField
            value={itemDate}
            onChange={setItemDate}
            label="Date"
          />

          {/* Visibility Section */}
          <VisibilityToggle
            value={visibility}
            onChange={setVisibility}
            entityType="item"
            disabled={isLoading}
          />

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
                newPhotoPreviewUrl={
                  photoPreviewUrl ||
                  (!removeExistingPhoto && existingPhoto
                    ? pb.files.getURL(existingPhoto, existingPhoto.photo)
                    : "")
                }
                onPhotoCapture={handlePhotoCapture}
                onRemoveNewPhoto={handlePhotoRemove}
                showLabel={true}
                showNewPhotoBadge={false}
              />
            </CardContent>
          </Card>

          {/* Collapsible Rating Legend */}
          <RatingLegend initiallyExpanded={!hasRatedBefore} />

          {/* Rating Section */}
          <Card>
            <CardContent className="space-y-3">
              <div>
                <Label className="font-semibold">Rating *</Label>
                <div className="mt-2">
                  <RatingSelector
                    value={rating}
                    onChange={setRating}
                    disabled={isLoading}
                  />
                </div>
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

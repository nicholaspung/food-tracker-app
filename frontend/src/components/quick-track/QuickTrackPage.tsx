import { logger } from '@/lib/logger';
import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import MenuItemPhotoInput from "@/components/visits/shared/MenuItemPhotoInput";
import { VisibilityToggle } from "@/components/ui/VisibilityToggle";
import { RatingSelector } from "@/components/ui/RatingSelector";
import { RatingLegend } from "@/components/ui/RatingLegend";
import { useOfflineQuickTrack } from "@/hooks/offline/useOfflineQuickTrack";
import { useSync } from "@/contexts/SyncContext";
import { useScrollIntoView } from "@/hooks/ui/useScrollIntoView";
import {
  getTodayLocalDateString,
  localDateStringToUTC,
} from "@/lib/dateUtils";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { usePhotoManager } from "@/hooks/photos/usePhotoManager";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { isOfflineError, handleOfflineSuccess, OFFLINE_MESSAGES } from "@/lib/offlineHelpers";
import { ITEM_CATEGORIES } from "@/constants/quickTrack";

export default function QuickTrackPage() {
  const navigate = useNavigate();
  const { showSuccess } = useErrorHandler({
    source: 'QuickTrackPage',
    autoClearMs: 5000,
  });

  // Check for note data from sessionStorage (from Use Saved Note flow)
  const [sourceNoteId, setSourceNoteId] = useState<string | undefined>(undefined);

  // Form state
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState<'convenience_store' | 'packaged_food' | 'homemade' | 'recipe' | 'other' | ''>("");

  const [rating, setRating] = useState<number | null>(3); // Default to "worth trying"

  // Wrapper for category setter to handle string values from Select component
  const handleCategoryChange = (value: string) => {
    setCategory(value as 'convenience_store' | 'packaged_food' | 'homemade' | 'recipe' | 'other' | '');
  };

  // Photo management hook
  const {
    photo,
    previewUrl: photoPreviewUrl,
    handleCapture,
    handleRemove,
  } = usePhotoManager();

  const [locationText, setLocationText] = useState("");
  const [notes, setNotes] = useState("");
  const [itemDate, setItemDate] = useState(getTodayLocalDateString());
  const [visibility, setVisibility] = useState<"friends" | "private">(
    "friends"
  );

  // UI state
  const hasRatedBefore = localStorage.getItem("hasRatedBefore") === "true";

  // Load note data from sessionStorage on mount (from Use Saved Note flow)
  useEffect(() => {
    const noteDataStr = sessionStorage.getItem("noteForQuickTrack");
    if (noteDataStr) {
      try {
        const noteData = JSON.parse(noteDataStr);
        setSourceNoteId(noteData.noteId);
        // Pre-fill notes field with note content
        setNotes(noteData.content || "");
        // Pre-fill location if available
        if (noteData.location_text) {
          setLocationText(noteData.location_text);
        }
        // Clean up sessionStorage
        sessionStorage.removeItem("noteForQuickTrack");
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  // Refs for auto-scrolling
  const itemNameInputRef = useScrollIntoView<HTMLInputElement>();
  const notesInputRef = useScrollIntoView<HTMLTextAreaElement>();

  // Offline-aware Quick Track
  const { isOnline } = useSync();
  const saveItemMutation = useOfflineQuickTrack();

  const handlePhotoCapture = useCallback(
    (_key: string | number, file: File) => {
      handleCapture(file);
    },
    [handleCapture]
  );

  const handlePhotoRemove = useCallback(
    (_key: string | number) => {
      handleRemove();
    },
    [handleRemove]
  );

  const handleSaveItem = async () => {
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
        logger.log("Could not get GPS location:", error);
        // Continue without GPS coordinates
      }
    }

    try {
      await saveItemMutation.mutateAsync({
        name: itemName,
        rating: rating,
        notes: notes || undefined,
        itemCategory: category || undefined,
        location_text: locationText || undefined,
        latitude,
        longitude,
        photo: photo || undefined,
        visibility,
        itemDate: itemDate ? localDateStringToUTC(itemDate) : undefined,
        sourceNoteId,
      });

      // Success
      localStorage.setItem("hasRatedBefore", "true");
      navigate({ to: "/home" });
    } catch (error: any) {
      logger.error("Failed to save quick track item:", error);

      // Show helpful message if offline
      if (!isOnline && isOfflineError(error)) {
        handleOfflineSuccess(OFFLINE_MESSAGES.ITEM_SAVED, showSuccess);
        localStorage.setItem("hasRatedBefore", "true");
        navigate({ to: "/home" });
      }
    }
  };

  const isSubmitDisabled =
    !itemName.trim() || rating === null || saveItemMutation.isPending;

  const isLoading = saveItemMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSaveItem();
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Quick Track Item</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
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
                photoKey="quick-track"
                newPhotoPreviewUrl={photoPreviewUrl}
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
                  value={category}
                  onValueChange={handleCategoryChange}
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
          {saveItemMutation.isError &&
            !saveItemMutation.error?.message?.includes("queued") && (
              <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
                <p className="font-semibold">Error saving item</p>
                <p className="text-sm">
                  Please try again. Check browser console for details.
                </p>
              </div>
            )}
        </form>
      </div>

      {/* Bottom Action Buttons */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/add-visit" })}
            className="flex-1"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveItem}
            disabled={isSubmitDisabled}
            className="flex-1"
          >
            {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            {isLoading ? "Saving..." : "Save Item"}
          </Button>
        </div>
      </div>
    </div>
  );
}

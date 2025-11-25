import { useState } from "react";
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
import { ChevronDown, ChevronUp, ArrowLeft, Loader2, Users } from "lucide-react";
import { RATING_OPTIONS } from "@/lib/ratingConstants";
import MenuItemPhotoInput from "@/components/MenuItemPhotoInput";
import { useOfflineQuickTrack } from "@/hooks/useOfflineQuickTrack";
import { useSync } from "@/contexts/SyncContext";
import { useScrollIntoView } from "@/hooks/useScrollIntoView";

// Category options for Quick Track
export const ITEM_CATEGORIES = [
  { value: "convenience_store", label: "Convenience Store" },
  { value: "packaged_food", label: "Packaged Food" },
  { value: "homemade", label: "Homemade" },
  { value: "recipe", label: "Recipe" },
  { value: "other", label: "Other" },
] as const;

export default function QuickTrackPage() {
  const navigate = useNavigate();

  // Form state
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [rating, setRating] = useState<number | null>(3); // Default to "worth trying"
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string>("");
  const [locationText, setLocationText] = useState("");
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<'friends' | 'private'>('friends');

  // UI state
  const hasRatedBefore = localStorage.getItem("hasRatedBefore") === "true";
  const [isLegendExpanded, setIsLegendExpanded] = useState(!hasRatedBefore);

  // Refs for auto-scrolling
  const notesInputRef = useScrollIntoView<HTMLTextAreaElement>();

  // Offline-aware Quick Track
  const { isOnline } = useSync();
  const saveItemMutation = useOfflineQuickTrack();

  const handlePhotoCapture = (key: string | number, file: File) => {
    setPhoto(file);

    // Create preview URL
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreviewUrl(previewUrl);
  };

  const handlePhotoRemove = (key: string | number) => {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setPhoto(null);
    setPhotoPreviewUrl("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || rating === null) {
      return;
    }

    // Get GPS coordinates if available and location text is provided
    let latitude: number | undefined;
    let longitude: number | undefined;

    if (navigator.geolocation && locationText.trim()) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
            maximumAge: 300000, // 5 minutes
          });
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      } catch (error) {
        console.log("Could not get GPS location:", error);
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
      });

      // Success
      localStorage.setItem("hasRatedBefore", "true");
      navigate({ to: "/home" });
    } catch (error: any) {
      console.error("Failed to save quick track item:", error);

      // Show helpful message if offline
      if (!isOnline && error.message?.includes('queued')) {
        alert("You're offline. Your item has been saved and will sync when you're back online.");
        localStorage.setItem("hasRatedBefore", "true");
        navigate({ to: "/home" });
      }
    }
  };

  const isSubmitDisabled =
    !itemName.trim() ||
    rating === null ||
    saveItemMutation.isPending;

  const isLoading = saveItemMutation.isPending;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => navigate({ to: "/home" })}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            disabled={isLoading}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-semibold">Quick Track Item</h1>
          <div className="w-9" /> {/* Spacer for alignment */}
        </div>
      </div>

      {/* Main Content */}
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* Item Name Section */}
        <Card>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="itemName" className="font-semibold">
                Item Name *
              </Label>
              <Input
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
          </CardContent>
        </Card>

        {/* Category Section */}
        <Card>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="category" className="font-semibold">
                Category (Optional)
              </Label>
              <Select value={category} onValueChange={setCategory} disabled={isLoading}>
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

        {/* Photo Upload Section */}
        <Card>
          <CardContent className="space-y-3">
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

        {/* Location Section */}
        <Card>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>

        {/* Notes Section */}
        <Card>
          <CardContent className="space-y-3">
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

        {/* Visibility Section */}
        <Card>
          <CardContent className="space-y-3">
            <div className="p-3 bg-white rounded-lg border border-gray-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibility === 'friends'}
                  onChange={(e) => setVisibility(e.target.checked ? 'friends' : 'private')}
                  disabled={isLoading}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium">Friends can view this item</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {visibility === 'friends'
                      ? 'Your friends will be able to see this quick track item'
                      : 'Only you will be able to see this item'}
                  </p>
                </div>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Error Display */}
        {saveItemMutation.isError && !saveItemMutation.error?.message?.includes('queued') && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
            <p className="font-semibold">Error saving item</p>
            <p className="text-sm">
              Please try again. Check browser console for details.
            </p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full py-6 text-lg font-semibold"
          disabled={isSubmitDisabled}
        >
          {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          {isLoading ? "Saving..." : "Save Item"}
        </Button>
      </form>
    </div>
  );
}

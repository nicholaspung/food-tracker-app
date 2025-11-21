import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { pb } from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ChevronDown, ChevronUp, ArrowLeft, Loader2 } from "lucide-react";
import { RATING_OPTIONS } from "@/lib/ratingConstants";
import MenuItemPhotoInput from "@/components/MenuItemPhotoInput";
import { usePhotoUpload, type PhotoUploadItem } from "@/hooks/usePhotoUpload";
import { useScrollIntoView } from "@/hooks/useScrollIntoView";

// Category options for Quick Track
export const ITEM_CATEGORIES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "convenience_store", label: "Convenience Store" },
  { value: "packaged_food", label: "Packaged Food" },
  { value: "homemade", label: "Homemade" },
  { value: "recipe", label: "Recipe" },
  { value: "other", label: "Other" },
] as const;

export default function QuickTrackPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Form state
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [rating, setRating] = useState<number | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string>("");
  const [locationText, setLocationText] = useState("");
  const [notes, setNotes] = useState("");

  // UI state
  const [showLocationField, setShowLocationField] = useState(false);
  const hasRatedBefore = localStorage.getItem("hasRatedBefore") === "true";
  const [isLegendExpanded, setIsLegendExpanded] = useState(!hasRatedBefore);

  // Refs for auto-scrolling
  const notesInputRef = useScrollIntoView<HTMLTextAreaElement>();

  // Photo upload hook
  const { state: uploadState, uploadPhotos, reset: resetUploadState } = usePhotoUpload();

  // Save mutation
  const saveItemMutation = useMutation({
    mutationFn: async () => {
      const user = pb.authStore.record;
      if (!user || !rating) throw new Error("Missing required data");

      // Get GPS coordinates if available
      let latitude: number | undefined;
      let longitude: number | undefined;

      if (navigator.geolocation && showLocationField) {
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

      // Create food item without visit (Quick Track mode)
      const foodItem = await pb.collection("food_items").create({
        name: itemName,
        rating: rating,
        notes: notes || undefined,
        itemCategory: category || undefined,
        location_text: locationText || undefined,
        latitude: latitude,
        longitude: longitude,
        user: user.id,
        // visit field is intentionally omitted (optional for Quick Track)
      });

      // Upload photo if provided
      if (photo) {
        const photoUpload: PhotoUploadItem = {
          photo,
          foodItemId: foodItem.id,
          userId: user.id,
          // visitId is intentionally omitted (optional for Quick Track)
        };

        await uploadPhotos([photoUpload]);
      }

      return foodItem;
    },
    onSuccess: async () => {
      // Invalidate queries to refetch data
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["allFoodItems"] }),
        queryClient.invalidateQueries({ queryKey: ["quickTrackItems"] }),
      ]);

      // Mark that user has rated before
      localStorage.setItem("hasRatedBefore", "true");

      // Reset upload state
      resetUploadState();

      // Navigate to home
      navigate({ to: "/home" });
    },
    onError: () => {
      // Reset upload state on error so user can retry
      resetUploadState();
    },
  });

  const handlePhotoCapture = (file: File) => {
    setPhoto(file);

    // Create preview URL
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreviewUrl(previewUrl);
  };

  const handlePhotoRemove = () => {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setPhoto(null);
    setPhotoPreviewUrl("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || rating === null) {
      return;
    }
    saveItemMutation.mutate();
  };

  const isSubmitDisabled =
    !itemName.trim() ||
    rating === null ||
    saveItemMutation.isPending ||
    uploadState.status === "compressing" ||
    uploadState.status === "uploading";

  const isLoading =
    saveItemMutation.isPending ||
    uploadState.status === "compressing" ||
    uploadState.status === "uploading";

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
      <form onSubmit={handleSubmit} className="p-4 space-y-6">
        {/* Item Name */}
        <div className="space-y-2">
          <Label htmlFor="itemName" className="text-base font-semibold">
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
            className="text-base"
          />
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label htmlFor="category" className="text-base font-semibold">
            Category
          </Label>
          <Select value={category} onValueChange={setCategory} disabled={isLoading}>
            <SelectTrigger id="category" className="text-base">
              <SelectValue placeholder="Select category (optional)" />
            </SelectTrigger>
            <SelectContent>
              {ITEM_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value} className="text-base">
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Rating */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center justify-between">
              <span>Rating *</span>
              <button
                type="button"
                onClick={() => setIsLegendExpanded(!isLegendExpanded)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {isLegendExpanded ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Rating legend */}
            {isLegendExpanded && (
              <div className="space-y-2 text-sm border-l-4 border-primary pl-4 py-2">
                {RATING_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-start gap-2">
                    <span className="font-medium min-w-[20px]">{option.value}★</span>
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-muted-foreground">{option.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Rating buttons */}
            <div className="flex gap-2">
              {RATING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRating(option.value)}
                  disabled={isLoading}
                  className={`flex-1 py-3 rounded-lg border-2 font-semibold text-lg transition-all ${
                    rating === option.value
                      ? "bg-primary text-primary-foreground border-primary shadow-lg scale-105"
                      : "bg-background border-border hover:border-primary/50 hover:scale-105"
                  }`}
                >
                  {option.value}★
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Photo Upload */}
        <div className="space-y-2">
          <Label className="text-base font-semibold">Photo (Optional)</Label>
          <MenuItemPhotoInput
            onCapture={handlePhotoCapture}
            onRemove={handlePhotoRemove}
            previewUrl={photoPreviewUrl}
            disabled={isLoading}
          />
        </div>

        {/* Location */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowLocationField(!showLocationField)}
            className="text-sm text-primary hover:underline"
          >
            {showLocationField ? "Hide location" : "+ Add location"}
          </button>
          {showLocationField && (
            <div className="space-y-2">
              <Input
                type="text"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="e.g., 7-Eleven on Main St, Trader Joe's"
                maxLength={200}
                disabled={isLoading}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground">
                GPS coordinates will be automatically captured if available
              </p>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes" className="text-base font-semibold">
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
            className="text-base resize-none"
          />
        </div>

        {/* Error Display */}
        {(saveItemMutation.isError || uploadState.error) && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
            <p className="font-semibold">Error saving item</p>
            <p className="text-sm">
              {uploadState.error || "Please try again. Check browser console for details."}
            </p>
          </div>
        )}

        {/* Upload Progress */}
        {uploadState.status === "compressing" && (
          <div className="bg-muted px-4 py-3 rounded-lg">
            <p className="text-sm font-medium">Compressing photo...</p>
            <div className="mt-2 h-2 bg-background rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${uploadState.progress / 2}%` }}
              />
            </div>
          </div>
        )}

        {uploadState.status === "uploading" && (
          <div className="bg-muted px-4 py-3 rounded-lg">
            <p className="text-sm font-medium">Uploading photo...</p>
            <div className="mt-2 h-2 bg-background rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${50 + uploadState.progress / 2}%` }}
              />
            </div>
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

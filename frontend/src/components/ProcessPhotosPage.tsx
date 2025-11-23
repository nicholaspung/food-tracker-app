import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Upload, Loader2, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { RATING_OPTIONS } from "@/lib/ratingConstants";
import { useOfflineQuickTrack } from "@/hooks/useOfflineQuickTrack";
import { useSync } from "@/contexts/SyncContext";
import RestaurantNameFinder from "@/components/RestaurantNameFinder";

interface PhotoToProcess {
  id: string;
  file: File;
  previewUrl: string;
}

interface ProcessedPhoto {
  photoId: string;
  restaurant: any;
  menuItemName: string;
  rating: number;
  notes: string;
}

export default function ProcessPhotosPage() {
  const navigate = useNavigate();
  const { isOnline } = useSync();
  const quickTrackMutation = useOfflineQuickTrack();

  // Photo management
  const [photos, setPhotos] = useState<PhotoToProcess[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [processedPhotos, setProcessedPhotos] = useState<ProcessedPhoto[]>([]);

  // Form state for current photo
  const [selectedRestaurant, setSelectedRestaurant] = useState<any>(null);
  const [menuItemName, setMenuItemName] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  // UI state
  const hasRatedBefore = localStorage.getItem("hasRatedBefore") === "true";
  const [isLegendExpanded, setIsLegendExpanded] = useState(!hasRatedBefore);
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPhotos: PhotoToProcess[] = files.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setPhotos(newPhotos);
    setCurrentPhotoIndex(0);
    e.target.value = ""; // Reset input
  };

  const handleRestaurantSelected = (restaurant: any) => {
    setSelectedRestaurant(restaurant);
  };

  const handleSubmitCurrent = async () => {
    if (!selectedRestaurant || !menuItemName.trim() || rating === null) {
      alert("Please fill in all required fields");
      return;
    }

    setIsProcessing(true);
    const currentPhoto = photos[currentPhotoIndex];

    try {
      // Save this photo's data using Quick Track
      await quickTrackMutation.mutateAsync({
        name: menuItemName,
        rating: rating,
        notes: notes || undefined,
        itemCategory: "restaurant",
        location_text: selectedRestaurant.name,
        latitude: selectedRestaurant.latitude,
        longitude: selectedRestaurant.longitude,
        photo: currentPhoto.file,
      });

      // Mark as processed
      setProcessedPhotos([...processedPhotos, {
        photoId: currentPhoto.id,
        restaurant: selectedRestaurant,
        menuItemName,
        rating,
        notes,
      }]);

      // Move to next photo or finish
      if (currentPhotoIndex < photos.length - 1) {
        // Move to next photo
        setCurrentPhotoIndex(currentPhotoIndex + 1);
        // Reset form
        setSelectedRestaurant(null);
        setMenuItemName("");
        setRating(null);
        setNotes("");
      } else {
        // All photos processed
        localStorage.setItem("hasRatedBefore", "true");
        navigate({ to: "/home" });
      }
    } catch (error: any) {
      console.error("Failed to save photo:", error);

      // Show helpful message if offline
      if (!isOnline && error.message?.includes('queued')) {
        // Still move forward since it's queued
        if (currentPhotoIndex < photos.length - 1) {
          setCurrentPhotoIndex(currentPhotoIndex + 1);
          setSelectedRestaurant(null);
          setMenuItemName("");
          setRating(null);
          setNotes("");
        } else {
          localStorage.setItem("hasRatedBefore", "true");
          navigate({ to: "/home" });
        }
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const currentPhoto = photos[currentPhotoIndex];
  const isUploadScreen = photos.length === 0;

  if (isUploadScreen) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b">
          <div className="flex items-center justify-between p-4">
            <button
              onClick={() => navigate({ to: "/add-visit" })}
              className="p-2 hover:bg-accent rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-semibold">Process Photos</h1>
            <div className="w-9" />
          </div>
        </div>

        {/* Upload Screen */}
        <div className="p-4 flex flex-col items-center justify-center min-h-[60vh]">
          <Upload className="h-20 w-20 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">Upload Photos</h2>
          <p className="text-muted-foreground text-center mb-8 max-w-md">
            Select multiple photos from your camera roll. You'll rate each one with a restaurant and menu item.
          </p>

          <label
            htmlFor="photo-upload"
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium cursor-pointer hover:bg-primary/90 transition-colors"
          >
            Choose Photos
            <input
              id="photo-upload"
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoSelect}
              className="hidden"
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => {
              if (confirm("Are you sure? Unprocessed photos will be lost.")) {
                navigate({ to: "/add-visit" });
              }
            }}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            disabled={isProcessing}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-semibold">
            Photo {currentPhotoIndex + 1} of {photos.length}
          </h1>
          <div className="w-9" />
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((currentPhotoIndex + 1) / photos.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Photo Preview */}
      <div className="p-4">
        <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
          <img
            src={currentPhoto.previewUrl}
            alt="Food photo"
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmitCurrent();
        }}
        className="p-4 space-y-6"
      >
        {/* Restaurant Selection */}
        <div className="space-y-2">
          <Label className="text-base font-semibold">Restaurant *</Label>
          <RestaurantNameFinder
            onRestaurantSelected={handleRestaurantSelected}
            selectedRestaurant={selectedRestaurant}
          />
        </div>

        {/* Menu Item Name */}
        <div className="space-y-2">
          <Label htmlFor="menuItemName" className="text-base font-semibold">
            Menu Item *
          </Label>
          <Input
            id="menuItemName"
            type="text"
            value={menuItemName}
            onChange={(e) => setMenuItemName(e.target.value)}
            placeholder="e.g., Margherita Pizza, Pad Thai"
            maxLength={200}
            required
            disabled={isProcessing}
            className="text-base"
          />
        </div>

        {/* Rating */}
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Rating *</Label>
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
            </div>

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
                  disabled={isProcessing}
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

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes" className="text-base font-semibold">
            Notes (Optional)
          </Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional thoughts or details..."
            maxLength={1000}
            rows={3}
            disabled={isProcessing}
            className="text-base resize-none"
          />
        </div>

        {/* Error Display */}
        {quickTrackMutation.isError && !quickTrackMutation.error?.message?.includes('queued') && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
            <p className="font-semibold">Error saving photo</p>
            <p className="text-sm">
              Please try again. Check browser console for details.
            </p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full py-6 text-lg font-semibold"
          disabled={!selectedRestaurant || !menuItemName.trim() || rating === null || isProcessing}
        >
          {isProcessing && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          {isProcessing
            ? "Saving..."
            : currentPhotoIndex < photos.length - 1
              ? "Save & Next Photo"
              : "Save & Finish"}
          {currentPhotoIndex < photos.length - 1 && !isProcessing && (
            <ChevronRight className="ml-2 h-5 w-5" />
          )}
        </Button>
      </form>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Upload, Loader2, ChevronRight, ChevronDown, ChevronUp, MapPin, Copy } from "lucide-react";
import { RATING_OPTIONS } from "@/lib/ratingConstants";
import { useOfflineQuickTrack } from "@/hooks/useOfflineQuickTrack";
import { useSync } from "@/contexts/SyncContext";
import RestaurantNameFinder from "@/components/RestaurantNameFinder";

type ScreenState = 'upload' | 'assign-restaurants' | 'process';

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

  // Screen state
  const [screen, setScreen] = useState<ScreenState>('upload');

  // Photo management
  const [photos, setPhotos] = useState<PhotoToProcess[]>([]);
  const [photoRestaurants, setPhotoRestaurants] = useState<Map<string, any>>(new Map());
  const [currentAssigningPhotoIndex, setCurrentAssigningPhotoIndex] = useState(0);
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
    setPhotoRestaurants(new Map());
    setCurrentAssigningPhotoIndex(0);
    setCurrentPhotoIndex(0);
    setScreen('assign-restaurants');
    e.target.value = ""; // Reset input
  };

  // Pre-fill restaurant when moving to processing screen
  useEffect(() => {
    if (screen === 'process' && photos.length > 0) {
      const currentPhoto = photos[currentPhotoIndex];
      const assignedRestaurant = photoRestaurants.get(currentPhoto.id);
      if (assignedRestaurant && !selectedRestaurant) {
        setSelectedRestaurant(assignedRestaurant);
      }
    }
  }, [screen, currentPhotoIndex, photos, photoRestaurants]);

  const handleRestaurantSelected = (restaurant: any) => {
    setSelectedRestaurant(restaurant);
  };

  // Restaurant assignment handlers
  const handleAssignRestaurant = (photoId: string, restaurant: any) => {
    setPhotoRestaurants(new Map(photoRestaurants.set(photoId, restaurant)));
  };

  const handleSameAsAbove = (photoIndex: number) => {
    if (photoIndex === 0) return;

    const previousPhoto = photos[photoIndex - 1];
    const previousRestaurant = photoRestaurants.get(previousPhoto.id);

    if (previousRestaurant) {
      const currentPhoto = photos[photoIndex];
      handleAssignRestaurant(currentPhoto.id, previousRestaurant);
    }
  };

  const handleContinueToProcessing = () => {
    setScreen('process');
    setCurrentPhotoIndex(0);
    // Pre-fill first photo's restaurant if assigned
    if (photos.length > 0) {
      const firstPhoto = photos[0];
      const assignedRestaurant = photoRestaurants.get(firstPhoto.id);
      if (assignedRestaurant) {
        setSelectedRestaurant(assignedRestaurant);
      }
    }
  };

  const handleSkipRestaurantAssignment = () => {
    setScreen('process');
    setCurrentPhotoIndex(0);
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
        const nextPhotoIndex = currentPhotoIndex + 1;
        setCurrentPhotoIndex(nextPhotoIndex);

        // Reset form and pre-fill restaurant if assigned
        const nextPhoto = photos[nextPhotoIndex];
        const nextRestaurant = photoRestaurants.get(nextPhoto.id);
        setSelectedRestaurant(nextRestaurant || null);
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
          const nextPhotoIndex = currentPhotoIndex + 1;
          setCurrentPhotoIndex(nextPhotoIndex);

          // Reset form and pre-fill restaurant if assigned
          const nextPhoto = photos[nextPhotoIndex];
          const nextRestaurant = photoRestaurants.get(nextPhoto.id);
          setSelectedRestaurant(nextRestaurant || null);
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

  // Upload Screen
  if (screen === 'upload') {
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
            Select multiple photos from your camera roll. You'll assign restaurants, then rate each item.
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

  // Restaurant Assignment Screen
  if (screen === 'assign-restaurants') {
    const allAssigned = photos.every(photo => photoRestaurants.has(photo.id));

    return (
      <div className="min-h-screen bg-background pb-32">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b">
          <div className="flex items-center justify-between p-4">
            <button
              onClick={() => {
                if (confirm("Go back? You'll need to re-upload photos.")) {
                  setPhotos([]);
                  setPhotoRestaurants(new Map());
                  setScreen('upload');
                }
              }}
              className="p-2 hover:bg-accent rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-semibold">Assign Restaurants</h1>
            <div className="w-9" />
          </div>
        </div>

        {/* Info */}
        <div className="p-4 pb-2">
          <p className="text-sm text-muted-foreground">
            Assign a restaurant to each photo. This will speed up rating later.
          </p>
        </div>

        {/* Photos List */}
        <div className="p-4 space-y-4">
          {photos.map((photo, index) => {
            const assignedRestaurant = photoRestaurants.get(photo.id);
            const previousRestaurant = index > 0 ? photoRestaurants.get(photos[index - 1].id) : null;

            return (
              <Card key={photo.id} className={assignedRestaurant ? "border-primary" : ""}>
                <CardContent className="p-4 space-y-3">
                  {/* Photo Header */}
                  <div className="flex items-center gap-3">
                    <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      <img
                        src={photo.previewUrl}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">Photo {index + 1}</div>
                      {assignedRestaurant && (
                        <div className="flex items-center gap-1 text-sm text-primary mt-1">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">{assignedRestaurant.name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Restaurant Selection */}
                  {!assignedRestaurant && (
                    <>
                      <RestaurantNameFinder
                        onRestaurantSelected={(restaurant) => handleAssignRestaurant(photo.id, restaurant)}
                        selectedRestaurant={null}
                      />

                      {/* Same as Above Button */}
                      {index > 0 && previousRestaurant && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => handleSameAsAbove(index)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Same as above ({previousRestaurant.name})
                        </Button>
                      )}
                    </>
                  )}

                  {/* Edit Button */}
                  {assignedRestaurant && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        const newMap = new Map(photoRestaurants);
                        newMap.delete(photo.id);
                        setPhotoRestaurants(newMap);
                      }}
                    >
                      Change Restaurant
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Bottom Actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 space-y-2">
          <Button
            className="w-full py-6 text-lg font-semibold"
            onClick={handleContinueToProcessing}
            disabled={!allAssigned}
          >
            Continue to Rating
            <ChevronRight className="ml-2 h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            className="w-full"
            onClick={handleSkipRestaurantAssignment}
          >
            Skip - Assign During Rating
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            {photoRestaurants.size} of {photos.length} restaurants assigned
          </p>
        </div>
      </div>
    );
  }

  // Processing Screen
  const currentPhoto = photos[currentPhotoIndex];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => {
              if (currentPhotoIndex === 0) {
                // Go back to restaurant assignment
                if (confirm("Go back to restaurant assignment?")) {
                  setScreen('assign-restaurants');
                  setSelectedRestaurant(null);
                  setMenuItemName("");
                  setRating(null);
                  setNotes("");
                }
              } else {
                // Ask if they want to go back to previous photo or cancel entirely
                if (confirm("Are you sure? Unprocessed photos will be lost.")) {
                  navigate({ to: "/add-visit" });
                }
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

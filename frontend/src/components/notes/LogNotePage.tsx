import { logger } from "@/lib/logger";
import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft, MapPin, X, Plus, Camera } from "lucide-react";
import { useScrollIntoView } from "@/hooks/ui/useScrollIntoView";
import { usePhotoManager } from "@/hooks/photos/usePhotoManager";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { useSync } from "@/contexts/SyncContext";
import { useOfflineNoteCreation } from "@/hooks/offline/useOfflineNoteCreation";
import { isOfflineError, handleOfflineSuccess, OFFLINE_MESSAGES } from "@/lib/offlineHelpers";
import { MAX_PHOTOS_PER_NOTE } from "@/constants/limits";

interface LogNotePageProps {
  from?: "add-visit" | "notes";
}

export default function LogNotePage({ from }: LogNotePageProps) {
  const navigate = useNavigate();

  // Determine back navigation based on where user came from
  const backPath = from === "add-visit" ? "/add-visit" : "/notes";
  const { showSuccess, handleError, error } = useErrorHandler({
    source: "LogNotePage",
    autoClearMs: 5000,
  });

  // Form state
  const [content, setContent] = useState("");
  const [locationText, setLocationText] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Photo management - multiple photos mode
  const {
    getPhotos,
    getPreviewUrls,
    addMultiplePhotos,
    removePhoto,
    getPhotoCount,
    cleanup,
  } = usePhotoManager<string>(true);

  const photoKey = "note-photos";
  const photos = getPhotos(photoKey);
  const previewUrls = getPreviewUrls(photoKey);
  const photoCount = getPhotoCount(photoKey);

  // Refs for auto-scrolling
  const contentInputRef = useScrollIntoView<HTMLTextAreaElement>();

  // Offline-aware note creation
  const { isOnline } = useSync();
  const createNoteMutation = useOfflineNoteCreation();

  const handleGetLocation = async () => {
    if (!navigator.geolocation) {
      handleError(new Error("Geolocation is not supported by your browser"));
      return;
    }

    setIsGettingLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000,
            maximumAge: 300000,
          });
        }
      );

      // Use reverse geocoding if online (future enhancement)
      // For now, just store coordinates
      setLocationText(
        `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`
      );
    } catch (error) {
      logger.error("Failed to get location:", error);
      handleError(new Error("Could not get your location. Please enter it manually."));
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handlePhotoSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);
      const added = addMultiplePhotos(photoKey, fileArray);

      if (added < fileArray.length) {
        handleError(new Error(`Only ${MAX_PHOTOS_PER_NOTE} photos allowed. Added ${added} of ${fileArray.length}.`));
      }

      // Reset the input
      event.target.value = "";
    },
    [addMultiplePhotos, handleError]
  );

  const handlePhotoRemove = useCallback(
    (index: number) => {
      removePhoto(photoKey, index);
    },
    [removePhoto]
  );

  const handleSaveNote = async () => {
    if (!content.trim()) {
      handleError(new Error("Please enter some content for your note"));
      return;
    }

    // Get GPS coordinates if location text looks like coordinates
    let latitude: number | undefined;
    let longitude: number | undefined;

    // Check if locationText is coordinates
    const coordMatch = locationText.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      latitude = parseFloat(coordMatch[1]);
      longitude = parseFloat(coordMatch[2]);
    } else if (navigator.geolocation && locationText.trim()) {
      // Try to get current location if there's location text
      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5000,
              maximumAge: 300000,
            });
          }
        );
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      } catch (error) {
        logger.log("Could not get GPS location:", error);
      }
    }

    try {
      await createNoteMutation.mutateAsync({
        content: content.trim(),
        location_text: locationText.trim() || undefined,
        latitude,
        longitude,
        photos: photos.length > 0 ? photos : undefined,
      });

      cleanup();
      showSuccess("Note saved!");
      navigate({ to: "/notes" });
    } catch (error: any) {
      logger.error("Failed to save note:", error);

      if (!isOnline && isOfflineError(error)) {
        handleOfflineSuccess(OFFLINE_MESSAGES.ITEM_SAVED, showSuccess);
        cleanup();
        navigate({ to: "/notes" });
      } else {
        handleError(error);
      }
    }
  };

  const isSubmitDisabled = !content.trim() || createNoteMutation.isPending;
  const isLoading = createNoteMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSaveNote();
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: backPath })}
            disabled={isLoading}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">Log Note</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tip */}
          <p className="text-sm text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <span className="font-medium">Tip:</span> Each note should be for one restaurant visit or one quick track item. You can convert notes to entries later.
          </p>

          {/* Note Content */}
          <Card>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="content" className="font-semibold">
                  What are you eating? *
                </Label>
                <Textarea
                  ref={contentInputRef}
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Describe your food, place, or anything you want to remember..."
                  maxLength={2000}
                  rows={4}
                  required
                  disabled={isLoading}
                  className="resize-none"
                  data-testid="note-content-input"
                />
                <p className="text-xs text-gray-500 text-right">
                  {content.length}/2000
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Photos Section */}
          <Card>
            <CardContent className="space-y-3">
              <Label className="font-semibold flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Photos (Optional)
              </Label>

              {/* Photo Grid */}
              {photoCount > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {previewUrls.map((url, index) => (
                    <div key={index} className="relative aspect-square">
                      <img
                        src={url}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover rounded-md"
                      />
                      <button
                        type="button"
                        onClick={() => handlePhotoRemove(index)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Photo Button */}
              {photoCount < MAX_PHOTOS_PER_NOTE && (
                <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoSelect}
                    className="hidden"
                    disabled={isLoading}
                  />
                  <Plus className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Add photos ({photoCount}/{MAX_PHOTOS_PER_NOTE})
                  </span>
                </label>
              )}
            </CardContent>
          </Card>

          {/* Location Section */}
          <Card>
            <CardContent className="space-y-3">
              <Label htmlFor="location" className="font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Location (Optional)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="location"
                  type="text"
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  placeholder="e.g., Starbucks on Main St"
                  maxLength={200}
                  disabled={isLoading}
                  className="flex-1"
                  data-testid="note-location-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGetLocation}
                  disabled={isLoading || isGettingLocation}
                  title="Use current location"
                >
                  {isGettingLocation ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <MapPin className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Enter a place name or use GPS to capture your location
              </p>
            </CardContent>
          </Card>

          {/* Error Display */}
          {error && (
            <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
              <p className="text-sm">{error.message}</p>
            </div>
          )}
        </form>
      </div>

      {/* Bottom Action Buttons */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => navigate({ to: backPath })}
            className="flex-1"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveNote}
            disabled={isSubmitDisabled}
            className="flex-1"
            data-testid="save-note-button"
          >
            {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            {isLoading ? "Saving..." : "Save Note"}
          </Button>
        </div>
      </div>
    </div>
  );
}

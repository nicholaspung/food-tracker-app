import { logger } from "@/lib/logger";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft, MapPin, X, Plus } from "lucide-react";
import { useNote, useNotePhotos } from "@/hooks/api/useNotes";
import { useOfflineNoteUpdate } from "@/hooks/offline/useOfflineNoteUpdate";
import { useSync } from "@/contexts/SyncContext";
import { useScrollIntoView } from "@/hooks/ui/useScrollIntoView";
import { useKeyboardVisible } from "@/hooks/ui/useKeyboardVisible";
import { usePhotoManager } from "@/hooks/photos/usePhotoManager";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { pb, User } from "@/lib/pocketbase";
import { MAX_PHOTOS_PER_NOTE, MAX_PHOTOS_SUBSCRIBER } from "@/constants/limits";

interface EditNotePageProps {
  noteId: string;
}

export default function EditNotePage({ noteId }: EditNotePageProps) {
  const navigate = useNavigate();

  // Determine photo limit based on subscription status
  const user = pb.authStore.record as User | null;
  const isSubscriber = user?.isSubscriber === true;
  const maxPhotos = isSubscriber ? MAX_PHOTOS_SUBSCRIBER : MAX_PHOTOS_PER_NOTE;
  const { showSuccess, handleError, error } = useErrorHandler({
    source: "EditNotePage",
    autoClearMs: 5000,
  });

  // Fetch note and photos
  const { data: note, isLoading: noteLoading } = useNote(noteId);
  const { data: existingPhotos = [] } = useNotePhotos(noteId);

  // Form state
  const [content, setContent] = useState("");
  const [locationText, setLocationText] = useState("");
  const [photosToDelete, setPhotosToDelete] = useState<string[]>([]);
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Photo management - multiple photos mode with subscriber-aware limit
  const {
    getPhotos,
    getPreviewUrls,
    addMultiplePhotos,
    removePhoto,
    getPhotoCount,
    cleanup,
  } = usePhotoManager<string>(true, maxPhotos);

  const photoKey = "note-edit-photos";
  const newPhotos = getPhotos(photoKey);
  const newPreviewUrls = getPreviewUrls(photoKey);
  const newPhotoCount = getPhotoCount(photoKey);

  // Filter existing photos that aren't marked for deletion
  const remainingExistingPhotos = existingPhotos.filter(
    (p) => !photosToDelete.includes(p.id)
  );
  const totalPhotoCount = remainingExistingPhotos.length + newPhotoCount;

  // Refs for auto-scrolling
  const contentInputRef = useScrollIntoView<HTMLTextAreaElement>();

  // Mutation and UI hooks
  const { isOnline } = useSync();
  const updateNoteMutation = useOfflineNoteUpdate();
  const isKeyboardVisible = useKeyboardVisible();

  // Populate form when note loads
  useEffect(() => {
    if (note) {
      setContent(note.content || "");
      setLocationText(note.location_text || "");
    }
  }, [note]);

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

      const remainingSlots = maxPhotos - totalPhotoCount;
      if (remainingSlots <= 0) {
        handleError(new Error(`Maximum ${maxPhotos} photos allowed.`));
        return;
      }

      const fileArray = Array.from(files).slice(0, remainingSlots);
      addMultiplePhotos(photoKey, fileArray);

      event.target.value = "";
    },
    [addMultiplePhotos, totalPhotoCount, handleError]
  );

  const handleRemoveExistingPhoto = useCallback((photoId: string) => {
    setPhotosToDelete((prev) => [...prev, photoId]);
  }, []);

  const handleRemoveNewPhoto = useCallback(
    (index: number) => {
      removePhoto(photoKey, index);
    },
    [removePhoto]
  );

  const handleUpdateNote = async () => {
    if (!content.trim()) {
      handleError(new Error("Please enter some content for your note"));
      return;
    }

    // Get GPS coordinates if location text looks like coordinates
    let latitude: number | undefined;
    let longitude: number | undefined;

    const coordMatch = locationText.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      latitude = parseFloat(coordMatch[1]);
      longitude = parseFloat(coordMatch[2]);
    }

    try {
      await updateNoteMutation.mutateAsync({
        id: noteId,
        content: content.trim(),
        location_text: locationText.trim() || null,
        latitude: latitude || null,
        longitude: longitude || null,
        newPhotos: newPhotos.length > 0 ? newPhotos : undefined,
        deletePhotoIds: photosToDelete.length > 0 ? photosToDelete : undefined,
      });

      cleanup();
      showSuccess("Note updated!");
      navigate({ to: "/notes" });
    } catch (error: any) {
      logger.error("Failed to update note:", error);

      if (!isOnline && error.message?.includes("queued")) {
        showSuccess("You're offline. Changes saved and will sync when online.");
        cleanup();
        navigate({ to: "/notes" });
      } else {
        handleError(error);
      }
    }
  };

  const isSubmitDisabled = !content.trim() || updateNoteMutation.isPending;
  const isLoading = updateNoteMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleUpdateNote();
  };

  if (noteLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-gray-600">Note not found</p>
          <Button
            onClick={() => navigate({ to: "/notes" })}
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
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/notes" })}
            disabled={isLoading}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">Edit Note</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Used status indicator */}
          {note.status === "used" && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800">
                This note has been used. You can still edit it for reference.
              </p>
            </div>
          )}

          {/* Note Content */}
          <Card>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="content" className="font-semibold">
                  Content *
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
              <Label className="font-semibold">Photos</Label>

              {/* Existing Photos Grid */}
              {remainingExistingPhotos.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {remainingExistingPhotos.map((photo) => (
                    <div key={photo.id} className="relative aspect-square">
                      <img
                        src={pb.files.getURL(photo, photo.photo, { thumb: "100x100" })}
                        alt="Note photo"
                        className="w-full h-full object-cover rounded-md"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveExistingPhoto(photo.id)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* New Photos Grid */}
              {newPhotoCount > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {newPreviewUrls.map((url, index) => (
                    <div key={index} className="relative aspect-square">
                      <img
                        src={url}
                        alt={`New photo ${index + 1}`}
                        className="w-full h-full object-cover rounded-md"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveNewPhoto(index)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <div className="absolute bottom-0.5 left-0.5 bg-blue-500 text-white text-xs px-1 rounded">
                        New
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Photo Button */}
              {totalPhotoCount < maxPhotos && (
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
                    Add photos ({totalPhotoCount}/{maxPhotos})
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
      {!isKeyboardVisible && (
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/notes" })}
              className="flex-1"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateNote}
              disabled={isSubmitDisabled}
              className="flex-1"
              data-testid="update-note-button"
            >
              {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              {isLoading ? "Updating..." : "Update Note"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

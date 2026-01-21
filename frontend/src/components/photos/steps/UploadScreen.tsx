import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Store, Camera, X, ChevronRight, Loader2 } from "lucide-react";
import { ProcessType, PhotoToProcess } from "@/types/photos";
import { extractImageCaptureDate } from "@/lib/photoUtils";
import { NoteReferencePanel } from "@/components/notes/NoteReferencePanel";

interface UploadScreenProps {
  processType: ProcessType;
  photos: PhotoToProcess[];
  onPhotosSelected: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onRemovePhoto: (photoId: string) => void;
  onAddMorePhotos: (photos: PhotoToProcess[]) => void;
  onCancel: () => void;
  onNext: () => void;
  isKeyboardVisible: boolean;
  /** Note content when coming from "Use Note" flow */
  noteContent?: string;
  /** Note location when coming from "Use Note" flow */
  noteLocation?: string;
  /** Whether note photos are still loading */
  isLoadingNotePhotos?: boolean;
}

/**
 * Upload Screen - Select and manage photos to process
 *
 * Note: Blob URL cleanup is handled by usePhotoUpload hook when the entire
 * flow unmounts. We don't clean up here to preserve URLs when navigating
 * back and forth between upload and processing screens.
 */
export function UploadScreen({
  processType,
  photos,
  onPhotosSelected,
  onRemovePhoto,
  onAddMorePhotos,
  onCancel,
  onNext,
  isKeyboardVisible,
  noteContent,
  noteLocation,
  isLoadingNotePhotos,
}: UploadScreenProps) {
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            Process Saved Photos
          </h1>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Upload and rate multiple food photos
        </p>
        {processType && (
          <div className="mt-2">
            <Badge variant="secondary" className="gap-1.5">
              {processType === "restaurant" ? (
                <>
                  <Store className="w-3 h-3" />
                  Restaurant Visit
                </>
              ) : (
                <>
                  <Camera className="w-3 h-3" />
                  Quick Track Items
                </>
              )}
            </Badge>
          </div>
        )}
      </div>

      {/* Upload Screen */}
      {isLoadingNotePhotos ? (
        // Loading note photos
        <div className="flex-1 p-4 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 text-muted-foreground mb-4 animate-spin" />
          <h2 className="text-xl font-semibold mb-2">Loading photos from note...</h2>
          <p className="text-muted-foreground text-center">
            Please wait while we prepare your photos.
          </p>
        </div>
      ) : photos.length === 0 ? (
        // No photos selected yet - show upload UI
        <div className="flex-1 p-4 flex flex-col items-center justify-center">
          {/* Show note reference if available */}
          {noteContent && (
            <div className="w-full max-w-md mb-6">
              <NoteReferencePanel
                noteContent={noteContent}
                locationText={noteLocation}
                storageKey="uploadScreen"
              />
            </div>
          )}

          <Upload className="h-20 w-20 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">Upload Photos</h2>
          <p className="text-muted-foreground text-center mb-8 max-w-md">
            Select multiple photos from your camera roll. You'll select a
            restaurant and rate each photo.
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
              onChange={onPhotosSelected}
              className="hidden"
            />
          </label>
        </div>
      ) : (
        // Photos selected - show review UI
        <>
          <div className="flex-1 overflow-y-auto overscroll-contain p-4">
            {/* Show note reference if available */}
            {noteContent && (
              <NoteReferencePanel
                noteContent={noteContent}
                locationText={noteLocation}
                storageKey="uploadScreen"
              />
            )}

            <p className="text-sm text-muted-foreground mb-4">
              {photos.length} photo{photos.length !== 1 ? "s" : ""} selected.
              Review and remove any you don't want to process.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {photos.map((photo, index) => (
                <div
                  key={photo.id}
                  className="relative aspect-square rounded-lg overflow-hidden bg-muted group"
                >
                  <img
                    src={photo.previewUrl}
                    alt={`Photo ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 right-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 w-8 p-0 opacity-90"
                      onClick={() => onRemovePhoto(photo.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                    Photo {index + 1}
                  </div>
                </div>
              ))}
            </div>

            {/* Add more photos button */}
            <div className="mt-4">
              <label
                htmlFor="photo-upload-more"
                className="w-full flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors"
              >
                <Upload className="h-5 w-5 text-muted-foreground mr-2" />
                <span className="text-sm font-medium text-muted-foreground">
                  Add More Photos
                </span>
                <input
                  id="photo-upload-more"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length === 0) return;

                    const newPhotos: PhotoToProcess[] = await Promise.all(
                      files.map(async (file, index) => ({
                        id: `${Date.now()}-${index}`,
                        file,
                        previewUrl: URL.createObjectURL(file),
                        captureDate: await extractImageCaptureDate(file),
                      }))
                    );

                    onAddMorePhotos(newPhotos);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Footer with Cancel/Next buttons */}
          {!isKeyboardVisible && (
            <div className="bg-white border-t border-gray-200 p-4">
              <div className="flex gap-3">
                <Button variant="outline" onClick={onCancel} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={onNext} className="flex-1">
                  Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Upload, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BulkPhoto {
  id: string;
  file: File;
  previewUrl: string;
  assignedToIndex: number | null; // null = unassigned
}

interface BulkPhotoGalleryProps {
  photos: BulkPhoto[];
  items: Array<{ menuItem: { name: string } }>;
  onPhotosChange: (photos: BulkPhoto[]) => void;
  onAssignPhoto: (photoId: string, itemIndex: number) => void;
  onRemovePhoto: (photoId: string) => void;
  disabled?: boolean;
}

export default function BulkPhotoGallery({
  photos,
  items,
  onPhotosChange,
  onAssignPhoto,
  onRemovePhoto,
  disabled = false,
}: BulkPhotoGalleryProps) {
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPhotos: BulkPhoto[] = files.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      file,
      previewUrl: URL.createObjectURL(file),
      assignedToIndex: null,
    }));

    onPhotosChange([...photos, ...newPhotos]);
    e.target.value = ""; // Reset input
  };

  const handleRemovePhoto = (photoId: string) => {
    const photo = photos.find((p) => p.id === photoId);
    if (photo) {
      URL.revokeObjectURL(photo.previewUrl);
    }
    onRemovePhoto(photoId);
    if (selectedPhotoId === photoId) {
      setSelectedPhotoId(null);
    }
  };

  const handlePhotoClick = (photoId: string) => {
    setSelectedPhotoId(photoId === selectedPhotoId ? null : photoId);
  };

  const handleItemClick = (itemIndex: number) => {
    if (selectedPhotoId) {
      onAssignPhoto(selectedPhotoId, itemIndex);
      setSelectedPhotoId(null);
    }
  };

  const unassignedPhotos = photos.filter((p) => p.assignedToIndex === null);
  const assignedPhotos = photos.filter((p) => p.assignedToIndex !== null);

  return (
    <div className="space-y-4">
      {/* Upload Button */}
      <div className="flex items-center gap-2">
        <label
          htmlFor="bulk-photo-upload"
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
            disabled
              ? "opacity-50 cursor-not-allowed"
              : "hover:border-primary hover:bg-accent"
          )}
        >
          <Upload className="h-5 w-5" />
          <span className="font-medium">Upload Photos</span>
          <input
            id="bulk-photo-upload"
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            disabled={disabled}
            className="hidden"
          />
        </label>
      </div>

      {/* Instructions */}
      {photos.length > 0 && (
        <Card className="p-3 bg-muted">
          <p className="text-sm text-muted-foreground">
            {selectedPhotoId
              ? "👇 Tap an item below to assign the selected photo"
              : "👆 Tap a photo to select it, then tap an item to assign"}
          </p>
        </Card>
      )}

      {/* Unassigned Photos */}
      {unassignedPhotos.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">
            Unassigned Photos ({unassignedPhotos.length})
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {unassignedPhotos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => handlePhotoClick(photo.id)}
                disabled={disabled}
                className={cn(
                  "relative aspect-square rounded-lg overflow-hidden border-2 transition-all",
                  selectedPhotoId === photo.id
                    ? "border-primary shadow-lg scale-95"
                    : "border-border hover:border-primary/50"
                )}
              >
                <img
                  src={photo.previewUrl}
                  alt="Photo"
                  className="w-full h-full object-cover"
                />
                {selectedPhotoId === photo.id && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <Check className="h-8 w-8 text-primary-foreground" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemovePhoto(photo.id);
                  }}
                  disabled={disabled}
                  className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/80 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Assigned Photos by Item */}
      {assignedPhotos.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Assigned Photos</h3>
          <div className="space-y-2">
            {items.map((item, itemIndex) => {
              const itemPhotos = photos.filter(
                (p) => p.assignedToIndex === itemIndex
              );
              if (itemPhotos.length === 0) return null;

              return (
                <div key={itemIndex} className="flex items-center gap-2">
                  <div className="flex-1 text-sm font-medium truncate">
                    {item.menuItem.name}
                  </div>
                  <div className="flex gap-1">
                    {itemPhotos.map((photo) => (
                      <div
                        key={photo.id}
                        className="relative w-12 h-12 rounded border border-border overflow-hidden"
                      >
                        <img
                          src={photo.previewUrl}
                          alt={item.menuItem.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(photo.id)}
                          disabled={disabled}
                          className="absolute top-0 right-0 p-0.5 bg-destructive text-destructive-foreground rounded-bl"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Item Assignment Buttons (only show when photo is selected) */}
      {selectedPhotoId && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Assign to Item:</h3>
          <div className="space-y-2">
            {items.map((item, itemIndex) => (
              <button
                key={itemIndex}
                type="button"
                onClick={() => handleItemClick(itemIndex)}
                disabled={disabled}
                className="w-full p-3 text-left rounded-lg border-2 border-border hover:border-primary hover:bg-accent transition-colors font-medium"
              >
                {item.menuItem.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

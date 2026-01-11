import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Camera, Plus } from 'lucide-react';
import { MAX_PHOTOS_PER_FOOD_ITEM } from '@/constants/limits';

interface MenuItemPhotoStackProps {
  photoKey: string | number;
  newPhotoPreviewUrls: string[];
  existingPhotoUrls: string[];
  onAddPhoto: (key: string | number, file: File) => void;
  onAddMultiplePhotos?: (key: string | number, files: File[]) => void;
  onViewAll: () => void;
  maxPhotos?: number;
  showLabel?: boolean;
  labelText?: string;
  helpText?: string;
}

export default function MenuItemPhotoStack({
  photoKey,
  newPhotoPreviewUrls,
  existingPhotoUrls,
  onAddPhoto,
  onAddMultiplePhotos,
  onViewAll,
  maxPhotos = MAX_PHOTOS_PER_FOOD_ITEM,
  showLabel = true,
  labelText = "Photos (optional)",
  helpText = "Take a photo or choose from your library",
}: MenuItemPhotoStackProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allPhotos = [...existingPhotoUrls, ...newPhotoPreviewUrls];
  const totalCount = allPhotos.length;
  const hasPhotos = totalCount > 0;
  const canAddMore = totalCount < maxPhotos;
  const remainingSlots = maxPhotos - totalCount;
  const additionalCount = totalCount - 1;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Convert FileList to array and limit to remaining slots
    const fileArray = Array.from(files).slice(0, remainingSlots);

    if (onAddMultiplePhotos && fileArray.length > 1) {
      // Use batch add if multiple files selected
      onAddMultiplePhotos(photoKey, fileArray);
    } else {
      // Add files one by one
      fileArray.forEach(file => onAddPhoto(photoKey, file));
    }

    // Reset input so same files can be selected again
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      {showLabel && <Label>{labelText}</Label>}

      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      {!hasPhotos ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="w-4 h-4 mr-2" />
            Add Photo
          </Button>
          <p className="text-xs text-gray-500 text-center">
            {helpText}
          </p>
        </>
      ) : (
        <div
          className="relative cursor-pointer"
          onClick={onViewAll}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onViewAll()}
        >
          {/* Main photo display */}
          <img
            src={allPhotos[0]}
            alt="Dish preview"
            className="w-full h-48 object-cover rounded-lg"
          />

          {/* Photo count badge */}
          {additionalCount > 0 && (
            <div className="absolute top-2 left-2 bg-black/70 text-white text-sm px-2 py-1 rounded-full font-medium">
              +{additionalCount}
            </div>
          )}

          {/* Add more button (if not at max) */}
          {canAddMore && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute top-2 right-2"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          )}

          {/* Tap to view hint */}
          <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
            Tap to view all
          </div>
        </div>
      )}
    </div>
  );
}

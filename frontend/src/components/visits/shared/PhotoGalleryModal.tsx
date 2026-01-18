import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Camera, X } from 'lucide-react';
import { MAX_PHOTOS_PER_FOOD_ITEM } from '@/constants/limits';

interface PhotoGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  newPhotoPreviewUrls: string[];
  existingPhotoUrls: string[];
  onAddPhoto: (file: File) => void;
  onAddMultiplePhotos?: (files: File[]) => void;
  onRemoveNewPhoto: (photoIndex: number) => void;
  onDeleteExistingPhoto?: (photoIndex: number) => void;
  maxPhotos?: number;
}

export default function PhotoGalleryModal({
  isOpen,
  onClose,
  itemName,
  newPhotoPreviewUrls,
  existingPhotoUrls,
  onAddPhoto,
  onAddMultiplePhotos,
  onRemoveNewPhoto,
  onDeleteExistingPhoto,
  maxPhotos = MAX_PHOTOS_PER_FOOD_ITEM,
}: PhotoGalleryModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalPhotos = existingPhotoUrls.length + newPhotoPreviewUrls.length;
  const canAddMore = totalPhotos < maxPhotos;
  const remainingSlots = maxPhotos - totalPhotos;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Convert FileList to array and limit to remaining slots
    const fileArray = Array.from(files).slice(0, remainingSlots);

    if (onAddMultiplePhotos && fileArray.length > 1) {
      // Use batch add if multiple files selected
      onAddMultiplePhotos(fileArray);
    } else {
      // Add files one by one
      fileArray.forEach(file => onAddPhoto(file));
    }

    // Reset input so same files can be selected again
    e.target.value = '';
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Photos for {itemName}</DialogTitle>
        </DialogHeader>

        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
        />

        {/* Photo count */}
        <p className="text-sm text-gray-500">
          {totalPhotos} of {maxPhotos} photos
        </p>

        {/* Photo grid */}
        <div className="flex-1 overflow-y-auto">
          {totalPhotos === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <Camera className="w-12 h-12 mb-2" />
              <p>No photos yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {/* Existing photos */}
              {existingPhotoUrls.map((url, index) => (
                <div key={`existing-${index}`} className="relative">
                  <img
                    src={url}
                    alt={`Photo ${index + 1}`}
                    className="w-full aspect-square object-cover rounded-lg"
                  />
                  {onDeleteExistingPhoto && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-1 right-1 h-7 w-7 p-0"
                      onClick={() => onDeleteExistingPhoto(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}

              {/* New photos */}
              {newPhotoPreviewUrls.map((url, index) => (
                <div key={`new-${index}`} className="relative">
                  <img
                    src={url}
                    alt={`New photo ${index + 1}`}
                    className="w-full aspect-square object-cover rounded-lg"
                  />
                  <div className="absolute top-1 left-1 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded">
                    New
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1 h-7 w-7 p-0"
                    onClick={() => onRemoveNewPhoto(index)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add photo button */}
        <div className="pt-2 border-t">
          {canAddMore ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="w-4 h-4 mr-2" />
              Add Photo
            </Button>
          ) : (
            <p className="text-sm text-gray-500 text-center py-2">
              Maximum {maxPhotos} photos reached
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

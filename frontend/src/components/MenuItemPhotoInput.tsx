import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Camera, X } from 'lucide-react';

interface MenuItemPhotoInputProps {
  photoKey: string | number;
  newPhotoPreviewUrl?: string;
  existingPhotoUrl?: string;
  onPhotoCapture: (key: string | number, file: File) => void;
  onRemoveNewPhoto: (key: string | number) => void;
  onDeleteExistingPhoto?: (key: string | number) => void;
  showLabel?: boolean;
  showNewPhotoBadge?: boolean;
  labelText?: string;
  helpText?: string;
}

export default function MenuItemPhotoInput({
  photoKey,
  newPhotoPreviewUrl,
  existingPhotoUrl,
  onPhotoCapture,
  onRemoveNewPhoto,
  onDeleteExistingPhoto,
  showLabel = true,
  showNewPhotoBadge = false,
  labelText = "Photo (optional)",
  helpText = "Take a photo or choose from your library",
}: MenuItemPhotoInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasNewPhoto = !!newPhotoPreviewUrl;
  const hasExistingPhoto = !!existingPhotoUrl;

  return (
    <div className="space-y-2">
      {showLabel && <Label>{labelText}</Label>}

      {!hasNewPhoto && !hasExistingPhoto ? (
        <>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onPhotoCapture(photoKey, file);
              }
            }}
          />
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
      ) : hasNewPhoto ? (
        <div className="relative">
          <img
            src={newPhotoPreviewUrl}
            alt="Dish preview"
            className="w-full h-48 object-cover rounded-lg"
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute top-2 right-2"
            onClick={() => onRemoveNewPhoto(photoKey)}
          >
            <X className="w-4 h-4" />
          </Button>
          {showNewPhotoBadge && (
            <div className="absolute top-2 left-2 bg-green-600 text-white text-xs px-2 py-1 rounded">
              New photo
            </div>
          )}
        </div>
      ) : (
        <div className="relative">
          <img
            src={existingPhotoUrl}
            alt="Existing dish photo"
            className="w-full h-48 object-cover rounded-lg"
          />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onPhotoCapture(photoKey, file);
              }
            }}
          />
          <div className="absolute top-2 right-2 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="w-4 h-4 mr-1" />
              Replace
            </Button>
            {onDeleteExistingPhoto && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onDeleteExistingPhoto(photoKey)}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

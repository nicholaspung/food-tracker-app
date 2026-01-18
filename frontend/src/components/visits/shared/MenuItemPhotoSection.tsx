import { useState } from 'react';
import MenuItemPhotoStack from './MenuItemPhotoStack';
import PhotoGalleryModal from './PhotoGalleryModal';
import { MAX_PHOTOS_PER_FOOD_ITEM } from '@/constants/limits';

interface MenuItemPhotoSectionProps {
  photoKey: string | number;
  newPhotoPreviewUrls: string[];
  existingPhotoUrls: string[];
  onPhotoCapture: (key: string | number, file: File) => void;
  onMultiPhotoCapture?: (key: string | number, files: File[]) => void;
  onRemoveNewPhoto: (key: string | number, photoIndex: number) => void;
  onDeleteExistingPhoto?: (key: string | number, photoIndex: number) => void;
  itemName: string;
  maxPhotos?: number;
  showLabel?: boolean;
  labelText?: string;
}

export default function MenuItemPhotoSection({
  photoKey,
  newPhotoPreviewUrls,
  existingPhotoUrls,
  onPhotoCapture,
  onMultiPhotoCapture,
  onRemoveNewPhoto,
  onDeleteExistingPhoto,
  itemName,
  maxPhotos = MAX_PHOTOS_PER_FOOD_ITEM,
  showLabel = true,
  labelText = "Photos (optional)",
}: MenuItemPhotoSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleAddPhoto = (key: string | number, file: File) => {
    onPhotoCapture(key, file);
  };

  const handleAddMultiplePhotos = onMultiPhotoCapture
    ? (key: string | number, files: File[]) => onMultiPhotoCapture(key, files)
    : undefined;

  const handleModalAddPhoto = (file: File) => {
    onPhotoCapture(photoKey, file);
  };

  const handleModalAddMultiplePhotos = onMultiPhotoCapture
    ? (files: File[]) => onMultiPhotoCapture(photoKey, files)
    : undefined;

  const handleModalRemoveNewPhoto = (photoIndex: number) => {
    onRemoveNewPhoto(photoKey, photoIndex);
  };

  const handleModalDeleteExistingPhoto = onDeleteExistingPhoto
    ? (photoIndex: number) => onDeleteExistingPhoto(photoKey, photoIndex)
    : undefined;

  return (
    <>
      <MenuItemPhotoStack
        photoKey={photoKey}
        newPhotoPreviewUrls={newPhotoPreviewUrls}
        existingPhotoUrls={existingPhotoUrls}
        onAddPhoto={handleAddPhoto}
        onAddMultiplePhotos={handleAddMultiplePhotos}
        onViewAll={() => setIsModalOpen(true)}
        maxPhotos={maxPhotos}
        showLabel={showLabel}
        labelText={labelText}
      />

      <PhotoGalleryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        itemName={itemName}
        newPhotoPreviewUrls={newPhotoPreviewUrls}
        existingPhotoUrls={existingPhotoUrls}
        onAddPhoto={handleModalAddPhoto}
        onAddMultiplePhotos={handleModalAddMultiplePhotos}
        onRemoveNewPhoto={handleModalRemoveNewPhoto}
        onDeleteExistingPhoto={handleModalDeleteExistingPhoto}
        maxPhotos={maxPhotos}
      />
    </>
  );
}

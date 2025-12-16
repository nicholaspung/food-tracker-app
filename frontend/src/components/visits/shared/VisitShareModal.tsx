import { logger } from '@/lib/logger';
import { useState, useEffect } from "react";
import { X, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  generateVisitCompositeImage,
  BadgeTheme,
} from "@/services/photoService";
import { useErrorHandler } from '@/hooks/ui/useErrorHandler';
import { VisitPhoto } from '@/lib/pocketbase';
import type PocketBase from 'pocketbase';

interface PhotoWithFoodItem {
  photo: VisitPhoto;
  foodItem: {
    id: string;
    name: string;
    rating: number;
  };
}

interface VisitShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantName: string;
  visitDate: string;
  photosWithFoodItems: PhotoWithFoodItem[];
  pb: PocketBase;
}

export default function VisitShareModal({
  isOpen,
  onClose,
  restaurantName,
  visitDate,
  photosWithFoodItems,
  pb,
}: VisitShareModalProps) {
  const { handleError, showSuccess } = useErrorHandler({ source: 'VisitShareModal', autoClearMs: 5000 });
  const [theme, setTheme] = useState<BadgeTheme>("modern");
  const [showDate, setShowDate] = useState(true);
  const [showRating, setShowRating] = useState(true);
  const [showDishNames, setShowDishNames] = useState(true);
  const [showRestaurantName, setShowRestaurantName] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Generate composite preview when options change
  useEffect(() => {
    if (!isOpen || photosWithFoodItems.length === 0) return;

    const generatePreview = async () => {
      try {
        // Load all photo files
        const photoFiles = await Promise.all(
          photosWithFoodItems.map(async ({ photo, foodItem }) => {
            const photoUrl = pb.files.getURL(photo, photo.photo);
            const response = await fetch(photoUrl);
            const blob = await response.blob();
            const file = new File([blob], "dish-photo.jpg", {
              type: "image/jpeg",
            });

            return {
              file,
              dishName: foodItem.name,
              rating: foodItem.rating,
            };
          })
        );

        // Generate composite image
        const compositeBlob = await generateVisitCompositeImage(
          photoFiles,
          {
            restaurantName,
            visitDate,
          },
          {
            theme,
            position: 'bottom', // Not used in composite but required for interface
            showDate,
            showRating,
            showDishNames,
            showRestaurantName,
          }
        );

        // Revoke previous preview URL to avoid memory leaks
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }

        const url = URL.createObjectURL(compositeBlob);
        setPreviewUrl(url);
      } catch (error) {
        logger.error("Error generating preview:", error);
      }
    };

    generatePreview();

    // Cleanup function
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [
    isOpen,
    photosWithFoodItems,
    theme,
    showDate,
    showRating,
    showDishNames,
    showRestaurantName,
    restaurantName,
    visitDate,
    pb,
  ]);

  const handleShareAll = async () => {
    if (photosWithFoodItems.length === 0) return;

    setIsGenerating(true);
    try {
      // Load all photo files
      const photoFiles = await Promise.all(
        photosWithFoodItems.map(async ({ photo, foodItem }) => {
          const photoUrl = pb.files.getURL(photo, photo.photo);
          const response = await fetch(photoUrl);
          const blob = await response.blob();
          const file = new File([blob], "dish-photo.jpg", {
            type: "image/jpeg",
          });

          return {
            file,
            dishName: foodItem.name,
            rating: foodItem.rating,
          };
        })
      );

      // Generate single composite image
      const compositeBlob = await generateVisitCompositeImage(
        photoFiles,
        {
          restaurantName,
          visitDate,
        },
        {
          theme,
          position: 'bottom',
          showDate,
          showRating,
          showDishNames,
          showRestaurantName,
        }
      );

      const shareFile = new File(
        [compositeBlob],
        `${restaurantName.replace(/[^a-z0-9]/gi, "_")}_visit.jpg`,
        { type: "image/jpeg" }
      );

      // Try Web Share API first (native sharing on mobile)
      if (navigator.share && navigator.canShare) {
        const canShareFile = navigator.canShare({ files: [shareFile] });

        if (canShareFile) {
          await navigator.share({
            files: [shareFile],
            title: `${restaurantName} Visit`,
            text: `Check out what I tried at ${restaurantName}!`,
          });
          onClose();
          return;
        }
      }

      // Fallback: Download the composite image
      const url = URL.createObjectURL(shareFile);
      const a = document.createElement("a");
      a.href = url;
      a.download = shareFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showSuccess("Photo downloaded! Share it on your favorite social media.");
      onClose();
    } catch (error) {
      logger.error("Error sharing photos:", error);
      handleError(error as Error, { customMessage: "Failed to share photos. Please try again." });
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white text-lg font-semibold">Share Visit Collage</h2>
            <p className="text-white/70 text-sm">
              {photosWithFoodItems.length} dish{photosWithFoodItems.length !== 1 ? "es" : ""} from {restaurantName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white p-2 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Content - Split Layout */}
      <div className="h-full flex flex-col pt-20">
        {/* Preview Section (scrollable) */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="max-w-lg mx-auto space-y-4">
            {/* Show single composite preview */}
            {previewUrl ? (
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Visit composite preview"
                  className="w-full rounded-lg shadow-2xl"
                />
              </div>
            ) : (
              <div className="w-full aspect-square bg-gray-800 rounded-lg flex items-center justify-center">
                <p className="text-gray-400">Generating preview...</p>
              </div>
            )}
          </div>
        </div>

        {/* Options Section (fixed at bottom, scrollable if needed) */}
        <div className="bg-gray-900 border-t border-gray-700 px-4 py-3 space-y-3 overflow-y-auto max-h-[50vh]">
          {/* Style Selection */}
          <div>
            <label className="text-white text-sm font-medium mb-2 block">
              Overlay Style
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme("modern")}
                className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  theme === "modern"
                    ? "bg-gray-700 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-750"
                }`}
              >
                Modern
              </button>
              <button
                onClick={() => setTheme("rustic")}
                className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  theme === "rustic"
                    ? "bg-amber-700 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-750"
                }`}
              >
                Rustic
              </button>
              <button
                onClick={() => setTheme("minimal")}
                className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  theme === "minimal"
                    ? "bg-white text-gray-900"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-750"
                }`}
              >
                Minimal
              </button>
            </div>
          </div>

          {/* Overlay Visibility Toggle */}
          <div>
            <label className="text-white text-sm font-medium mb-2 block">
              Show Overlays
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDishNames(!showDishNames)}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  showDishNames
                    ? "bg-gray-700 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-750"
                }`}
              >
                Dish Names
              </button>
              <button
                onClick={() => setShowRestaurantName(!showRestaurantName)}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  showRestaurantName
                    ? "bg-gray-700 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-750"
                }`}
              >
                Restaurant
              </button>
            </div>
          </div>

          {/* Date/Rating Toggle */}
          <div>
            <label className="text-white text-sm font-medium mb-2 block">
              Show on Badge
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRating(!showRating)}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  showRating
                    ? "bg-gray-700 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-750"
                }`}
              >
                Rating
              </button>
              <button
                onClick={() => setShowDate(!showDate)}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  showDate
                    ? "bg-gray-700 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-750"
                }`}
              >
                Date
              </button>
            </div>
          </div>

          {/* Share Button */}
          <Button
            onClick={handleShareAll}
            disabled={isGenerating}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3"
          >
            {isGenerating ? (
              "Generating..."
            ) : (
              <>
                <Share2 className="w-4 h-4 mr-2" />
                Share Visit
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

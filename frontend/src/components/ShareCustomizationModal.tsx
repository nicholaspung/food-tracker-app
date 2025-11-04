import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateSocialShareImage, BadgeTheme, BadgePosition } from "@/services/photoService";

interface ShareCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  photoUrl: string;
  photoFile: File | null;
  overlayData: {
    restaurantName: string;
    dishName: string;
    rating: number;
    visitDate: string;
  };
  onShare: (shareBlob: Blob) => Promise<void>;
}

export default function ShareCustomizationModal({
  isOpen,
  onClose,
  photoFile,
  overlayData,
  onShare,
}: ShareCustomizationModalProps) {
  const [theme, setTheme] = useState<BadgeTheme>('modern');
  const [position, setPosition] = useState<BadgePosition>('bottom');
  const [showDate, setShowDate] = useState(false);
  const [showRating, setShowRating] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Generate preview whenever options change
  useEffect(() => {
    if (!isOpen || !photoFile) return;

    const generatePreview = async () => {
      try {
        const blob = await generateSocialShareImage(photoFile, overlayData, {
          theme,
          position,
          showDate,
          showRating,
        });

        // Revoke previous preview URL to avoid memory leaks
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }

        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      } catch (error) {
        console.error('Error generating preview:', error);
      }
    };

    generatePreview();

    // Cleanup function
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [isOpen, photoFile, theme, position, showDate, showRating, overlayData]);

  const handleShare = async () => {
    if (!photoFile) return;

    setIsGenerating(true);
    try {
      const shareBlob = await generateSocialShareImage(photoFile, overlayData, {
        theme,
        position,
        showDate,
        showRating,
      });

      await onShare(shareBlob);
      onClose();
    } catch (error) {
      console.error('Error sharing:', error);
      alert('Failed to share photo. Please try again.');
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
          <h2 className="text-white text-lg font-semibold">Customize Share</h2>
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
      <div className="h-full flex flex-col pt-16 pb-24">
        {/* Preview Section (scrollable) */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-lg mx-auto">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full rounded-lg shadow-2xl"
              />
            ) : (
              <div className="w-full aspect-square bg-gray-800 rounded-lg flex items-center justify-center">
                <p className="text-gray-400">Generating preview...</p>
              </div>
            )}
          </div>
        </div>

        {/* Options Section (fixed at bottom) */}
        <div className="bg-gray-900 border-t border-gray-700 px-4 py-4 space-y-4">
          {/* Style Selection */}
          <div>
            <label className="text-white text-sm font-medium mb-2 block">
              Badge Style
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme('modern')}
                className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  theme === 'modern'
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-750'
                }`}
              >
                Modern
              </button>
              <button
                onClick={() => setTheme('rustic')}
                className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  theme === 'rustic'
                    ? 'bg-amber-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-750'
                }`}
              >
                Rustic
              </button>
              <button
                onClick={() => setTheme('minimal')}
                className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  theme === 'minimal'
                    ? 'bg-white text-gray-900'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-750'
                }`}
              >
                Minimal
              </button>
            </div>
          </div>

          {/* Position Selection */}
          <div>
            <label className="text-white text-sm font-medium mb-2 block">
              Badge Position
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setPosition('bottom-left')}
                className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  position === 'bottom-left'
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-750'
                }`}
              >
                Bottom Left
              </button>
              <button
                onClick={() => setPosition('bottom')}
                className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  position === 'bottom'
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-750'
                }`}
              >
                Bottom
              </button>
              <button
                onClick={() => setPosition('bottom-right')}
                className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  position === 'bottom-right'
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-750'
                }`}
              >
                Bottom Right
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
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-750'
                }`}
              >
                Rating
              </button>
              <button
                onClick={() => setShowDate(!showDate)}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  showDate
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-750'
                }`}
              >
                Date
              </button>
            </div>
          </div>

          {/* Share Button */}
          <Button
            onClick={handleShare}
            disabled={isGenerating}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3"
          >
            {isGenerating ? 'Generating...' : 'Share'}
          </Button>
        </div>
      </div>
    </div>
  );
}

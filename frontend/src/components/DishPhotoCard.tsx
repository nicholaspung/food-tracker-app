import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Share2, Download, WifiOff } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import ShareCustomizationModal from "@/components/ShareCustomizationModal";
import { RATING_LABELS, RATING_COLORS } from "@/lib/ratingConstants";
import { useSync } from "@/contexts/SyncContext";
import { useErrorHandler } from "@/hooks/useErrorHandler";

interface DishPhotoCardProps {
  photoRecord: {
    id: string;
    photo: string;
    caption?: string;
    collectionId: string;
    expand?: {
      food_item?: {
        name: string;
        rating: number;
        expand?: {
          visit?: {
            visitDate: string;
            expand?: {
              restaurant?: {
                name: string;
              };
            };
          };
        };
      };
    };
  };
}

export default function DishPhotoCard({ photoRecord }: DishPhotoCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const { isOnline } = useSync();
  const { handleError, showValidation, checkOffline, showSuccess } = useErrorHandler({
    source: 'DishPhotoCard',
    autoClearMs: 5000,
  });

  // Extract data from the expanded relations
  const foodItem = photoRecord.expand?.food_item;
  const visit = foodItem?.expand?.visit;
  const restaurant = visit?.expand?.restaurant;

  const photoUrl = pb.files.getURL(photoRecord, photoRecord.photo);

  const handleShareClick = async () => {
    if (checkOffline("Photo sharing requires internet connection. Please connect and try again.")) {
      return;
    }

    if (!foodItem || !visit || !restaurant) {
      showValidation("Missing data for sharing");
      return;
    }

    try {
      // Fetch the photo as a blob
      const response = await fetch(photoUrl);
      const blob = await response.blob();
      const file = new File([blob], 'dish-photo.jpg', { type: 'image/jpeg' });

      setPhotoFile(file);
      setIsModalOpen(true);
    } catch (error) {
      console.error('Error loading photo:', error);
      handleError(error as Error, { customMessage: 'Failed to load photo. Please try again.' });
    }
  };

  const handleShare = async (shareBlob: Blob) => {
    if (!foodItem || !restaurant) return;

    try {
      // Try Web Share API first (native sharing on mobile)
      if (navigator.share && navigator.canShare) {
        const shareFile = new File([shareBlob], 'food-tracker-share.jpg', {
          type: 'image/jpeg',
        });

        const canShareFile = navigator.canShare({ files: [shareFile] });

        if (canShareFile) {
          await navigator.share({
            files: [shareFile],
            title: `${foodItem.name} at ${restaurant.name}`,
            text: `Check out this dish I tried! Rated ${foodItem.rating}/5`,
          });
          return;
        }
      }

      // Fallback: Download the image
      const url = URL.createObjectURL(shareBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${foodItem.name.replace(/[^a-z0-9]/gi, '_')}_${restaurant.name.replace(/[^a-z0-9]/gi, '_')}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showSuccess('Photo downloaded! Share it on your favorite social media.');
    } catch (error) {
      console.error('Error sharing photo:', error);
      handleError(error as Error, { customMessage: 'Failed to share photo. Please try again.' });
    }
  };

  const handleDownload = async () => {
    if (!isOnline) {
      showValidation("Photo download requires internet connection. Please connect and try again.");
      return;
    }

    try {
      const response = await fetch(photoUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dish-${photoRecord.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading photo:', error);
      handleError(error as Error, { customMessage: 'Failed to download photo' });
    }
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="relative">
          <img
            src={photoUrl}
            alt={foodItem?.name || 'Dish photo'}
            className="w-full h-64 object-cover rounded-t-lg"
          />

          {/* Dish name overlay */}
          {foodItem && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
              <h3 className="text-white font-semibold text-lg">
                {foodItem.name}
              </h3>
              {restaurant && (
                <p className="text-white/80 text-sm">{restaurant.name}</p>
              )}
              <div className="mt-2">
                <Badge
                  className={`${
                    RATING_COLORS[foodItem.rating - 1] || "bg-gray-500"
                  } text-white text-xs`}
                >
                  {RATING_LABELS[foodItem.rating - 1] || "Unknown"}
                </Badge>
              </div>
            </div>
          )}
        </div>

        {photoRecord.caption && (
          <div className="p-4 border-t">
            <p className="text-sm text-gray-700">{photoRecord.caption}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="p-4 flex gap-2">
          <Button
            variant="default"
            className="flex-1"
            onClick={handleShareClick}
            disabled={!isOnline}
          >
            {isOnline ? (
              <><Share2 className="w-4 h-4 mr-2" />Share to Social</>
            ) : (
              <><WifiOff className="w-4 h-4 mr-2" />Share (Offline)</>
            )}
          </Button>
          <Button variant="outline" onClick={handleDownload} disabled={!isOnline}>
            {isOnline ? (
              <Download className="w-4 h-4" />
            ) : (
              <WifiOff className="w-4 h-4" />
            )}
          </Button>
        </div>
        {!isOnline && (
          <div className="px-4 pb-4 pt-0">
            <p className="text-xs text-orange-600 text-center">
              Photo sharing and download require internet connection
            </p>
          </div>
        )}
      </CardContent>

      {/* Share Customization Modal */}
      {foodItem && visit && restaurant && (
        <ShareCustomizationModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          photoUrl={photoUrl}
          photoFile={photoFile}
          overlayData={{
            restaurantName: restaurant.name,
            dishName: foodItem.name,
            rating: foodItem.rating,
            visitDate: visit.visitDate,
          }}
          onShare={handleShare}
        />
      )}
    </Card>
  );
}

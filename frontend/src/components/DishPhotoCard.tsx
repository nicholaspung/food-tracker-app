import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Share2, Download } from "lucide-react";
import { generateSocialShareImage } from "@/services/photoService";
import { pb } from "@/lib/pocketbase";

const RATING_LABELS = [
  "Don't eat ever",
  "Try once",
  "Eat once in a while",
  "Eat occasionally",
  "Eat often",
];

const RATING_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-500",
];

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<'modern' | 'rustic'>('modern');

  // Extract data from the expanded relations
  const foodItem = photoRecord.expand?.food_item;
  const visit = foodItem?.expand?.visit;
  const restaurant = visit?.expand?.restaurant;

  const photoUrl = pb.getFileUrl(photoRecord, photoRecord.photo);

  const handleShare = async () => {
    if (!foodItem || !visit || !restaurant) {
      alert("Missing data for sharing");
      return;
    }

    setIsGenerating(true);

    try {
      // Fetch the photo as a blob
      const response = await fetch(photoUrl);
      const blob = await response.blob();
      const file = new File([blob], 'dish-photo.jpg', { type: 'image/jpeg' });

      // Generate social share image with badge overlay
      const shareBlob = await generateSocialShareImage(file, {
        restaurantName: restaurant.name,
        dishName: foodItem.name,
        rating: foodItem.rating,
        visitDate: visit.visitDate,
      }, selectedTheme);

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

      alert('Photo downloaded! Share it on your favorite social media.');
    } catch (error) {
      console.error('Error sharing photo:', error);
      alert('Failed to share photo. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
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
      alert('Failed to download photo');
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

        {/* Theme selector */}
        <div className="px-4 pt-3 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Badge Style:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedTheme('modern')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  selectedTheme === 'modern'
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
              >
                Modern
              </button>
              <button
                onClick={() => setSelectedTheme('rustic')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  selectedTheme === 'rustic'
                    ? 'bg-amber-700 text-white'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
              >
                Rustic
              </button>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="p-4 flex gap-2">
          <Button
            variant="default"
            className="flex-1"
            onClick={handleShare}
            disabled={isGenerating}
          >
            <Share2 className="w-4 h-4 mr-2" />
            {isGenerating ? 'Generating...' : 'Share to Social'}
          </Button>
          <Button variant="outline" onClick={handleDownload}>
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

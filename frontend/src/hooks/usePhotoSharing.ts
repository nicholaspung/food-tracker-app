import { useState, useCallback } from "react";
import { pb } from "@/lib/pocketbase";
import { useErrorHandler } from "@/hooks/useErrorHandler";

export interface ShareOverlayData {
  restaurantName: string;
  dishName: string;
  rating: number;
  visitDate: string;
}

export interface UsePhotoSharingParams {
  visitPhotos: any[];
  isOnline: boolean;
}

export interface UsePhotoSharingReturn {
  // Individual photo share
  isShareModalOpen: boolean;
  sharePhotoFile: File | null;
  sharePhotoUrl: string;
  shareOverlayData: ShareOverlayData | null;
  handleSharePhotoClick: (
    photo: any,
    foodItem: any,
    restaurant: any,
    visitDate: string
  ) => Promise<void>;
  handleShare: (shareBlob: Blob) => Promise<void>;
  closeShareModal: () => void;

  // Visit share (multiple photos)
  visitToShare: any | null;
  handleShareVisitClick: (visit: any) => void;
  closeVisitShareModal: () => void;
}

/**
 * Hook to handle photo sharing for both individual photos and visit shares
 * Includes online status validation and Web Share API integration
 */
export function usePhotoSharing({
  visitPhotos,
  isOnline,
}: UsePhotoSharingParams): UsePhotoSharingReturn {
  const { handleError, showValidation, showSuccess } = useErrorHandler({
    source: "usePhotoSharing",
    autoClearMs: 5000,
  });

  // Individual photo share state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [sharePhotoFile, setSharePhotoFile] = useState<File | null>(null);
  const [sharePhotoUrl, setSharePhotoUrl] = useState<string>("");
  const [shareOverlayData, setShareOverlayData] = useState<ShareOverlayData | null>(null);

  // Visit share state (multiple photos)
  const [visitToShare, setVisitToShare] = useState<any | null>(null);

  // Handle opening share modal for individual photo
  const handleSharePhotoClick = useCallback(
    async (photo: any, foodItem: any, restaurant: any, visitDate: string) => {
      if (!isOnline) {
        showValidation("Photo sharing requires internet connection. Please connect and try again.");
        return;
      }

      try {
        // Get full resolution photo URL
        const photoUrl = pb.files.getURL(photo, photo.photo);

        // Fetch the photo as a blob
        const response = await fetch(photoUrl);
        const blob = await response.blob();
        const file = new File([blob], "dish-photo.jpg", { type: "image/jpeg" });

        setSharePhotoFile(file);
        setSharePhotoUrl(photoUrl);
        setShareOverlayData({
          restaurantName:
            restaurant?.name || foodItem.location_text || "Quick Track",
          dishName: foodItem.name,
          rating: foodItem.rating,
          visitDate: visitDate,
        });
        setIsShareModalOpen(true);
      } catch (error) {
        console.error("Error loading photo:", error);
        handleError(error as Error, { customMessage: "Failed to load photo. Please try again." });
      }
    },
    [isOnline, showValidation, handleError]
  );

  // Handle final share action from modal
  const handleShare = useCallback(
    async (shareBlob: Blob) => {
      if (!shareOverlayData) return;

      try {
        // Try Web Share API first (native sharing on mobile)
        if (navigator.share && navigator.canShare) {
          const shareFile = new File([shareBlob], "food-tracker-share.jpg", {
            type: "image/jpeg",
          });

          const canShareFile = navigator.canShare({ files: [shareFile] });

          if (canShareFile) {
            await navigator.share({
              files: [shareFile],
              title: `${shareOverlayData.dishName} at ${shareOverlayData.restaurantName}`,
              text: `Check out this dish I tried! Rated ${shareOverlayData.rating}/5`,
            });
            return;
          }
        }

        // Fallback: Download the image
        const url = URL.createObjectURL(shareBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${shareOverlayData.dishName.replace(/[^a-z0-9]/gi, "_")}_${shareOverlayData.restaurantName.replace(/[^a-z0-9]/gi, "_")}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showSuccess("Photo downloaded! Share it on your favorite social media.");
      } catch (error) {
        console.error("Error sharing photo:", error);
        handleError(error as Error, { customMessage: "Failed to share photo. Please try again." });
      }
    },
    [shareOverlayData, showSuccess, handleError]
  );

  // Close share modal
  const closeShareModal = useCallback(() => {
    setIsShareModalOpen(false);
  }, []);

  // Handle share visit button click
  const handleShareVisitClick = useCallback(
    (visit: any) => {
      // Check if visit has any photos
      const photosForVisit = visitPhotos.filter((photo: any) =>
        visit.foodItems?.some((item: any) => item.id === photo.food_item)
      );

      if (photosForVisit.length === 0) {
        showValidation("This visit has no photos to share.");
        return;
      }

      setVisitToShare(visit);
    },
    [visitPhotos, showValidation]
  );

  // Close visit share modal
  const closeVisitShareModal = useCallback(() => {
    setVisitToShare(null);
  }, []);

  return {
    // Individual photo share
    isShareModalOpen,
    sharePhotoFile,
    sharePhotoUrl,
    shareOverlayData,
    handleSharePhotoClick,
    handleShare,
    closeShareModal,

    // Visit share (multiple photos)
    visitToShare,
    handleShareVisitClick,
    closeVisitShareModal,
  };
}

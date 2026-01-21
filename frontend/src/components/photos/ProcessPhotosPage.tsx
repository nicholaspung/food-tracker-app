import { logger } from '@/lib/logger';
import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useKeyboardVisible } from "@/hooks/ui/useKeyboardVisible";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { useSync } from "@/contexts/SyncContext";
import { useMenuOCR } from "@/hooks/menu/useMenuOCR";
import { useOfflineVisitCreation } from "@/hooks/offline/useOfflineVisitCreation";
import { useOfflineRestaurantCreation } from "@/hooks/offline/useOfflineRestaurantCreation";
import { repositories } from '@/repositories';
import { useVisitsByUser, useFriendVisits } from "@/hooks/api/useVisits";
import { Friendship } from "@/lib/pocketbase";

// Custom hooks
import { usePhotoUpload } from "@/hooks/photos/usePhotoUpload";
import { useDraftManagement } from "@/hooks/photos/useDraftManagement";
import { usePhotoProcessing } from "@/hooks/photos/usePhotoProcessing";
import { useQuickTrackProcessing } from "@/hooks/photos/useQuickTrackProcessing";
import { usePhotoSubmission } from "@/hooks/photos/usePhotoSubmission";
import { useNotePhotoLoader } from "@/hooks/notes/useNotePhotoLoader";

// Zustand store
import { usePhotoProcessingStore } from "@/stores/photoProcessingStore";

// Screen components
import { ChoiceScreen } from "@/components/photos/steps/ChoiceScreen";
import { UploadScreen } from "@/components/photos/steps/UploadScreen";
import { QuickTrackProcessingScreen } from "@/components/photos/steps/QuickTrackProcessingScreen";
import { RestaurantProcessingScreen } from "@/components/photos/steps/RestaurantProcessingScreen";
import { QuickTrackReviewScreen } from "@/components/photos/steps/QuickTrackReviewScreen";
import { RestaurantReviewScreen } from "@/components/photos/steps/RestaurantReviewScreen";

// UI Components
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import RestaurantNameFinder from "@/components/visits/shared/RestaurantNameFinder";
import { X } from "lucide-react";

// Types & Services
import { pb, Restaurant, MenuItem } from "@/lib/pocketbase";
import { PhotoToProcess } from "@/types/photos";
import { useState } from "react";

/**
 * ProcessPhotosPage - Main orchestrator for photo processing workflow
 *
 * Manages the complete workflow for processing food photos:
 * 1. Choice: Select between Restaurant Visit or Quick Track
 * 2. Upload: Select and manage photos to process
 * 3. Process: Fill out form for each photo (different for restaurant vs quick track)
 * 4. Review: Preview all entries before submission
 *
 * Uses:
 * - Zustand store for UI state management
 * - Custom hooks for business logic
 * - Extracted screen components for rendering
 */
export default function ProcessPhotosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOnline } = useSync();
  const { handleError, showValidation } = useErrorHandler({
    source: "ProcessPhotosPage",
    autoClearMs: 5000,
  });
  const isKeyboardVisible = useKeyboardVisible();

  // Zustand store for UI state
  const {
    screen,
    processType,
    fullscreenPhoto,
    showCameraMode,
    showBackDialog,
    backDialogType,
    showRequiredFieldsDialog,
    setScreen,
    setProcessType,
    setFullscreenPhoto,
    setShowCameraMode,
    setShowBackDialog,
    setShowRequiredFieldsDialog,
    reset: resetStore,
  } = usePhotoProcessingStore();

  // Reset store state when component unmounts to ensure fresh start on re-entry
  useEffect(() => {
    return () => {
      resetStore();
    };
  }, [resetStore]);

  // Custom hooks
  const photoUpload = usePhotoUpload();
  const draftManagement = useDraftManagement();
  const restaurantProcessing = usePhotoProcessing();
  const quickTrackProcessing = useQuickTrackProcessing();
  const submission = usePhotoSubmission();

  // Wrapper for category setter to handle string values from QuickTrackProcessingScreen
  const handleQuickTrackCategoryChange = (cat: string) => {
    quickTrackProcessing.setCategory(cat as 'convenience_store' | 'packaged_food' | 'homemade' | 'recipe' | 'other' | '');
  };

  // Mutations
  const visitCreationMutation = useOfflineVisitCreation();
  const restaurantCreationMutation = useOfflineRestaurantCreation();

  // Menu OCR hook
  const {
    status: ocrStatus,
    progress: ocrProgress,
    menuItems: scannedMenuItems,
    error: ocrError,
  } = useMenuOCR();

  // Restaurant search state
  const [restaurantSearchQuery, setRestaurantSearchQuery] = useState("");
  const [locationSearchQuery, setLocationSearchQuery] = useState("");

  // Note data state (when coming from "Use Note" flow)
  // Initialize synchronously from sessionStorage to prevent choice screen flash
  const [noteData, setNoteData] = useState<{
    noteId: string;
    content: string;
    location_text?: string;
    processType: "restaurant" | "quickTrack";
    photoUrls: string[];
  } | null>(() => {
    const noteDataStr = sessionStorage.getItem("noteForProcessPhotos");
    if (noteDataStr) {
      try {
        return JSON.parse(noteDataStr);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  // Load photos from note URLs
  const { photos: notePhotos, isLoading: isLoadingNotePhotos } = useNotePhotoLoader(
    noteData?.photoUrls || []
  );

  // Track which restaurant we've set the default menu mode for
  // This prevents the mode from resetting when menuItems.length changes
  const lastDefaultModeRestaurantRef = useRef<string | null>(null);

  // Fetch restaurants
  const { data: restaurants = [] } = useQuery<Restaurant[]>({
    queryKey: ["restaurants"],
    queryFn: async () => {
      return await repositories.restaurants.getFullList({
        sort: "-created",
      });
    },
  });

  // Get current user
  const user = pb.authStore.model;

  // Fetch all visits for the current user
  const { data: userVisits = [] } = useVisitsByUser(user?.id);

  // Fetch friendships to get list of friends
  const { data: friendships = [] } = useQuery<Friendship[]>({
    queryKey: ["friendships", user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await repositories.friendships.getFullList({
        filter: `(user = "${user.id}" || friend = "${user.id}") && status = "accepted"`,
      });
    },
    enabled: !!user,
  });

  // Get list of friend IDs from friendships
  const friendIds = friendships.map((f) =>
    f.user === user?.id ? f.friend : f.user
  );

  // Fetch visits from friends
  const { data: friendVisits = [] } = useFriendVisits(user?.id, friendIds);

  // Calculate visit counts per restaurant
  const getRestaurantStats = useCallback((restaurantId: string) => {
    const userVisitCount = userVisits.filter(
      (v) => v.restaurant === restaurantId
    ).length;

    // Count unique friends who have visited this restaurant
    const friendsWhoVisited = new Set(
      friendVisits
        .filter((v) => v.restaurant === restaurantId)
        .map((v) => v.user)
    );
    const friendCount = friendsWhoVisited.size;

    return { userVisitCount, friendCount };
  }, [userVisits, friendVisits]);

  const filteredRestaurants = restaurants.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(restaurantSearchQuery.toLowerCase()) ||
      r.location.toLowerCase().includes(restaurantSearchQuery.toLowerCase()) ||
      (r.cuisineType?.toLowerCase() || "").includes(
        restaurantSearchQuery.toLowerCase()
      );

    const matchesLocation = locationSearchQuery.trim()
      ? r.location.toLowerCase().includes(locationSearchQuery.toLowerCase())
      : true;

    return matchesSearch && matchesLocation;
  });

  // Fetch menu items for selected restaurant
  const { data: menuItems = [], isFetching: isMenuItemsFetching } = useQuery<MenuItem[]>({
    queryKey: ["menu_items", restaurantProcessing.selectedRestaurant?.id],
    queryFn: async () => {
      if (!restaurantProcessing.selectedRestaurant?.id || !isOnline) return [];
      return await repositories.menuItems.getByRestaurant(restaurantProcessing.selectedRestaurant.id, {
        sort: "-created",
      });
    },
    enabled: !!restaurantProcessing.selectedRestaurant?.id,
  });

  // Set default menu item selection mode based on whether restaurant has menu items
  // Only runs ONCE when switching to a new restaurant (after menu items are fetched)
  useEffect(() => {
    const currentRestaurantId = restaurantProcessing.selectedRestaurant?.id ?? null;

    // Skip if no restaurant selected
    if (!currentRestaurantId) {
      lastDefaultModeRestaurantRef.current = null;
      return;
    }

    // Skip if still fetching menu items for this restaurant
    if (isMenuItemsFetching) {
      return;
    }

    // Skip if we've already set the default mode for this restaurant
    if (lastDefaultModeRestaurantRef.current === currentRestaurantId) {
      return;
    }

    // Set the default mode based on whether menu items exist
    lastDefaultModeRestaurantRef.current = currentRestaurantId;
    if (menuItems.length === 0) {
      restaurantProcessing.setMenuItemSelectionMode("create");
    } else {
      restaurantProcessing.setMenuItemSelectionMode("search");
    }
  }, [restaurantProcessing.selectedRestaurant?.id, menuItems.length, isMenuItemsFetching]);

  // Clear menu item selection when switching tabs
  useEffect(() => {
    if (
      restaurantProcessing.menuItemSelectionMode === "create" ||
      restaurantProcessing.menuItemSelectionMode === "scan"
    ) {
      restaurantProcessing.setSelectedMenuItem(null);
    }

    if (restaurantProcessing.menuItemSelectionMode === "create") {
      restaurantProcessing.setMenuItemName("");
    }
  }, [restaurantProcessing.menuItemSelectionMode]);

  // Track previous photo ID for state management
  const previousPhotoIdRef = useRef<string | null>(null);

  // Save/restore form state when navigating between photos
  useEffect(() => {
    const currentPhoto = photoUpload.currentPhoto;
    if (!currentPhoto) return;

    const currentPhotoId = currentPhoto.id;
    const previousPhotoId = previousPhotoIdRef.current;

    // Only save/restore when actually changing to a different photo
    // Skip if we're staying on the same photo (e.g., when photos array changes due to combining)
    if (previousPhotoId === currentPhotoId) {
      return; // Same photo, no need to save/restore
    }

    // If we're navigating to a different photo (and had a previous photo)
    if (previousPhotoId) {
      // Save state for the previous photo (if it wasn't just submitted)
      if (processType === "restaurant") {
        restaurantProcessing.saveFormStateForPhoto(previousPhotoId);
      } else if (processType === "quickTrack") {
        quickTrackProcessing.saveFormStateForPhoto(previousPhotoId);
      }
    }

    // Restore state for the current photo (either new photo or first photo)
    if (processType === "restaurant") {
      restaurantProcessing.restoreFormStateForPhoto(currentPhotoId, currentPhoto.captureDate);
    } else if (processType === "quickTrack") {
      quickTrackProcessing.restoreFormStateForPhoto(currentPhotoId, currentPhoto.captureDate);
    }

    // Update the previous photo ID ref
    previousPhotoIdRef.current = currentPhotoId;
  }, [photoUpload.currentPhotoIndex, photoUpload.photos, processType]);

  // Clear any existing draft on mount - user must start fresh on page refresh
  useEffect(() => {
    draftManagement.clearDraft();
  }, []);

  // Set up screen/processType from note data (from "Use Note" flow)
  // Note data is loaded synchronously in useState initializer above
  useEffect(() => {
    if (noteData) {
      // Set the process type from note data and skip choice screen
      setProcessType(noteData.processType);
      setScreen("upload");
      // Clean up sessionStorage
      sessionStorage.removeItem("noteForProcessPhotos");
      logger.log("[ProcessPhotosPage] Loaded note data:", noteData.noteId);
    }
  }, [noteData, setProcessType, setScreen]);

  // Populate photos from note when they finish loading
  useEffect(() => {
    if (noteData && notePhotos.length > 0 && photoUpload.photos.length === 0) {
      photoUpload.setPhotos(notePhotos);
      logger.log("[ProcessPhotosPage] Populated photos from note:", notePhotos.length);
    }
  }, [noteData, notePhotos, photoUpload.photos.length]);

  // Screen-specific handlers
  const handleChooseProcessType = (type: "restaurant" | "quickTrack") => {
    setProcessType(type);
    setScreen("upload");
  };

  const handlePhotosUploaded = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    await photoUpload.handlePhotoSelect(e);
    // Don't automatically move to process screen - wait for user to click Next
  };

  const handleAddMorePhotos = (newPhotos: PhotoToProcess[]) => {
    photoUpload.setPhotos([...photoUpload.photos, ...newPhotos]);
  };

  const handleRemovePhoto = (photoId: string) => {
    const updatedPhotos = photoUpload.photos.filter((p) => p.id !== photoId);
    photoUpload.setPhotos(updatedPhotos);

    // If we removed the current photo and it's not the last one, adjust the index
    if (
      photoUpload.currentPhotoIndex >= updatedPhotos.length &&
      updatedPhotos.length > 0
    ) {
      photoUpload.setCurrentPhotoIndex(updatedPhotos.length - 1);
    }
  };

  // Handle combining a photo with the current item
  const handleCombinePhoto = (photo: PhotoToProcess) => {
    // Add photo to combined photos for current item
    restaurantProcessing.combinePhoto(photo);

    // Remove from the main photo queue
    const updatedPhotos = photoUpload.photos.filter((p) => p.id !== photo.id);
    photoUpload.setPhotos(updatedPhotos);

    // Adjust indices if necessary
    if (photoUpload.currentPhotoIndex >= updatedPhotos.length && updatedPhotos.length > 0) {
      photoUpload.setCurrentPhotoIndex(updatedPhotos.length - 1);
    }
  };

  // Handle uncombining a photo (putting it back in the queue)
  const handleUncombinePhoto = (photoId: string) => {
    // Find the photo in combined photos
    const combinedPhoto = restaurantProcessing.combinedPhotos.find(p => p.photoId === photoId);
    if (!combinedPhoto) return;

    // Remove from combined photos
    restaurantProcessing.uncombinePhoto(photoId);

    // Add back to the photo queue after the current photo
    const photoToRestore: PhotoToProcess = {
      id: combinedPhoto.photoId,
      file: combinedPhoto.photo,
      previewUrl: combinedPhoto.previewUrl,
      captureDate: null, // We don't have the original capture date stored
    };

    const currentIndex = photoUpload.currentPhotoIndex;
    const updatedPhotos = [...photoUpload.photos];
    updatedPhotos.splice(currentIndex + 1, 0, photoToRestore);
    photoUpload.setPhotos(updatedPhotos);
  };

  const handleCancel = async () => {
    await draftManagement.clearDraft();
    // Navigate back to notes if we came from the "Use Note" flow
    if (noteData) {
      navigate({ to: "/notes" });
    } else {
      navigate({ to: "/add-visit" });
    }
  };

  const handleStartProcessing = () => {
    if (photoUpload.photos.length === 0) {
      showValidation("Please select at least one photo");
      return;
    }

    // Restore form state for the first photo (if it was previously saved)
    const firstPhoto = photoUpload.photos[0];
    if (firstPhoto && processType === "restaurant") {
      const restoredCombinedPhotos = restaurantProcessing.restoreFormStateForPhoto(
        firstPhoto.id,
        firstPhoto.captureDate
      );

      // If combined photos were restored, remove them from the queue
      if (restoredCombinedPhotos.length > 0) {
        const combinedPhotoIds = new Set(restoredCombinedPhotos.map(cp => cp.photoId));
        const updatedPhotos = photoUpload.photos.filter(p => !combinedPhotoIds.has(p.id));
        photoUpload.setPhotos(updatedPhotos);
      }
    }

    setScreen("process");
  };

  const handleSubmitCurrent = async () => {
    const currentPhoto = photoUpload.currentPhoto;
    if (!currentPhoto) return;

    if (processType === "restaurant") {
      await restaurantProcessing.handleSubmitCurrent(currentPhoto);
    } else if (processType === "quickTrack") {
      await quickTrackProcessing.handleSubmitCurrent(currentPhoto);
    }

    // Move to next or review
    if (photoUpload.currentPhotoIndex < photoUpload.photos.length - 1) {
      photoUpload.setCurrentPhotoIndex(photoUpload.currentPhotoIndex + 1);
    } else {
      setScreen("review");
    }
  };

  const handlePreviousFromProcessing = () => {
    if (photoUpload.currentPhotoIndex > 0) {
      photoUpload.setCurrentPhotoIndex(photoUpload.currentPhotoIndex - 1);
    } else {
      // Save current form state before going back (preserves combined photos, date, etc.)
      const currentPhoto = photoUpload.currentPhoto;
      if (currentPhoto && processType === "restaurant") {
        restaurantProcessing.saveFormStateForPhoto(currentPhoto.id);
      }

      // Going back to upload screen - restore any combined photos to the queue
      if (processType === "restaurant" && restaurantProcessing.combinedPhotos.length > 0) {
        const photosToRestore: PhotoToProcess[] = restaurantProcessing.combinedPhotos.map(cp => ({
          id: cp.photoId,
          file: cp.photo,
          previewUrl: cp.previewUrl,
          captureDate: null,
        }));

        // Add combined photos back to the queue after the current photo
        const updatedPhotos = [
          ...photoUpload.photos,
          ...photosToRestore,
        ];
        photoUpload.setPhotos(updatedPhotos);

        // Clear combined photos state (but it's saved in form state)
        restaurantProcessing.clearCombinedPhotos();
      }

      setScreen("upload");
    }
  };

  const handleEditFromReview = () => {
    // Go back to the last photo
    const lastPhotoIndex = photoUpload.photos.length - 1;
    const lastPhoto = photoUpload.photos[lastPhotoIndex];

    photoUpload.setCurrentPhotoIndex(lastPhotoIndex);

    // Explicitly restore the form state for the last photo
    // This is needed because the useEffect might not trigger if the index didn't change
    if (lastPhoto) {
      if (processType === "restaurant") {
        restaurantProcessing.restoreFormStateForPhoto(lastPhoto.id, lastPhoto.captureDate);

        // Restore combined photos for the last processed photo
        const lastProcessedPhoto = restaurantProcessing.processedPhotos.find(
          (p) => p.photoId === lastPhoto.id
        );
        if (lastProcessedPhoto?.combinedPhotos && lastProcessedPhoto.combinedPhotos.length > 0) {
          restaurantProcessing.restoreCombinedPhotos(lastProcessedPhoto.combinedPhotos);
        }
      } else if (processType === "quickTrack") {
        quickTrackProcessing.restoreFormStateForPhoto(lastPhoto.id, lastPhoto.captureDate);
      }
      // Update the previous photo ref to match
      previousPhotoIdRef.current = lastPhoto.id;
    }

    setScreen("process");
  };

  const handleSubmitAll = async () => {
    if (processType === "restaurant") {
      await submission.submitRestaurantVisits(
        restaurantProcessing.processedPhotos,
        restaurantProcessing.visitVisibility,
        noteData?.noteId
      );
    } else if (processType === "quickTrack") {
      await submission.submitQuickTrackItems(
        quickTrackProcessing.quickTrackPhotos,
        noteData?.noteId
      );
    }

    await draftManagement.clearDraft();
    navigate({ to: "/home" });
  };

  // Menu item creation handler
  const handleCreateMenuItem = async () => {
    if (!restaurantProcessing.selectedRestaurant) return;
    if (!restaurantProcessing.menuItemName.trim()) return;

    try {
      const newMenuItem = await repositories.menuItems.create({
        restaurant: restaurantProcessing.selectedRestaurant.id,
        name: restaurantProcessing.menuItemName.trim(),
        createdBy: pb.authStore.model?.id,
        visibility: 'friends', // Default visibility for user-created items
      });

      // Invalidate menu items query to refetch
      queryClient.invalidateQueries({
        queryKey: ["menu_items", restaurantProcessing.selectedRestaurant.id],
      });

      // Select the newly created item
      restaurantProcessing.setSelectedMenuItem(newMenuItem as unknown as MenuItem);
      restaurantProcessing.setMenuItemSelectionMode("search");
    } catch (error) {
      logger.error("Failed to create menu item:", error);
      handleError(error as Error, {
        customMessage: "Failed to create menu item. Please try again.",
      });
    }
  };

  // Menu item edit handler
  const handleEditMenuItem = async (itemId: string) => {
    if (!restaurantProcessing.editingMenuItemName.trim()) return;

    const newName = restaurantProcessing.editingMenuItemName.trim();
    const newVisibility = restaurantProcessing.editingMenuItemVisibility;
    const restaurantId = restaurantProcessing.selectedRestaurant?.id;

    try {
      await repositories.menuItems.update(itemId, {
        name: newName,
        visibility: newVisibility,
      });

      // Optimistically update the cache immediately so UI reflects the change
      queryClient.setQueryData<MenuItem[]>(
        ["menu_items", restaurantId],
        (oldData) => {
          if (!oldData) return oldData;
          return oldData.map((item) =>
            item.id === itemId ? { ...item, name: newName, visibility: newVisibility } : item
          );
        }
      );

      // Also invalidate to ensure consistency with server
      queryClient.invalidateQueries({
        queryKey: ["menu_items", restaurantId],
      });

      // Clear editing state
      restaurantProcessing.setEditingMenuItemId(null);
      restaurantProcessing.setEditingMenuItemName("");
      restaurantProcessing.setEditingMenuItemVisibility("private");
    } catch (error) {
      logger.error("Failed to edit menu item:", error);
      handleError(error as Error, {
        customMessage: "Failed to edit menu item. Please try again.",
      });
    }
  };

  // Render screens based on state
  // Skip choice screen if we have note data (waiting for effect to set screen to "upload")
  if (screen === "choice" && !noteData) {
    return (
      <ChoiceScreen
        onSelectType={handleChooseProcessType}
        onBack={() => navigate({ to: "/add-visit" })}
      />
    );
  }

  // Show loading state while note data is being set up
  if (screen === "choice" && noteData) {
    // Effect will set screen to "upload" - show nothing briefly
    return null;
  }

  if (screen === "upload") {
    return (
      <UploadScreen
        processType={processType!}
        photos={photoUpload.photos}
        onPhotosSelected={handlePhotosUploaded}
        onRemovePhoto={handleRemovePhoto}
        onAddMorePhotos={handleAddMorePhotos}
        onCancel={handleCancel}
        onNext={handleStartProcessing}
        isKeyboardVisible={isKeyboardVisible}
        noteContent={noteData?.content}
        noteLocation={noteData?.location_text}
        isLoadingNotePhotos={isLoadingNotePhotos}
      />
    );
  }

  if (screen === "process") {
    const currentPhoto = photoUpload.currentPhoto;
    if (!currentPhoto) return null;

    if (processType === "quickTrack") {
      return (
        <QuickTrackProcessingScreen
          currentPhoto={currentPhoto}
          currentPhotoIndex={photoUpload.currentPhotoIndex}
          totalPhotos={photoUpload.photos.length}
          itemName={quickTrackProcessing.itemName}
          category={quickTrackProcessing.category}
          rating={quickTrackProcessing.rating}
          locationText={quickTrackProcessing.locationText}
          notes={quickTrackProcessing.notes}
          date={quickTrackProcessing.date}
          visibility={quickTrackProcessing.visibility}
          onItemNameChange={quickTrackProcessing.setItemName}
          onCategoryChange={handleQuickTrackCategoryChange}
          onRatingChange={quickTrackProcessing.setRating}
          onLocationTextChange={quickTrackProcessing.setLocationText}
          onNotesChange={quickTrackProcessing.setNotes}
          onDateChange={quickTrackProcessing.setDate}
          onVisibilityChange={quickTrackProcessing.setVisibility}
          onSubmitCurrent={handleSubmitCurrent}
          onBack={handlePreviousFromProcessing}
          onFullscreenPhoto={(url, name) =>
            setFullscreenPhoto({ url, dishName: name })
          }
          isKeyboardVisible={isKeyboardVisible}
          canSubmit={quickTrackProcessing.canSubmitCurrent}
          noteContent={noteData?.content}
          noteLocation={noteData?.location_text}
        />
      );
    }

    // Calculate menu items already used for this restaurant (excluding current photo)
    const usedMenuItemNames = restaurantProcessing.processedPhotos
      .filter(
        (p) =>
          p.restaurant?.id === restaurantProcessing.selectedRestaurant?.id &&
          p.photoId !== currentPhoto.id &&
          p.menuItem?.name // Only include entries that have a menu item
      )
      .map((p) => p.menuItem.name.toLowerCase());

    // Calculate remaining photos available to combine (photos after current, not yet processed)
    const processedPhotoIds = new Set(restaurantProcessing.processedPhotos.map(p => p.photoId));
    const combinedPhotoIds = new Set(restaurantProcessing.combinedPhotos.map(p => p.photoId));
    const remainingPhotos = photoUpload.photos.filter((photo, index) =>
      index > photoUpload.currentPhotoIndex && // Only photos after current
      !processedPhotoIds.has(photo.id) && // Not already processed
      !combinedPhotoIds.has(photo.id) // Not already combined
    );

    return (
      <>
        <RestaurantProcessingScreen
          currentPhoto={currentPhoto}
          currentPhotoIndex={photoUpload.currentPhotoIndex}
          totalPhotos={photoUpload.photos.length}
          // Restaurant
          selectedRestaurant={restaurantProcessing.selectedRestaurant}
          restaurants={filteredRestaurants}
          restaurantSearchQuery={restaurantSearchQuery}
          locationSearchQuery={locationSearchQuery}
          onRestaurantSearchChange={setRestaurantSearchQuery}
          onLocationSearchChange={setLocationSearchQuery}
          onRestaurantSelected={restaurantProcessing.setSelectedRestaurant}
          previousRestaurant={
            restaurantProcessing.processedPhotos.length > 0
              ? restaurantProcessing.processedPhotos[
                  restaurantProcessing.processedPhotos.length - 1
                ].restaurant
              : null
          }
          onUsePreviousRestaurant={() => {
            const prevRestaurant =
              restaurantProcessing.processedPhotos[
                restaurantProcessing.processedPhotos.length - 1
              ].restaurant;
            restaurantProcessing.setSelectedRestaurant(prevRestaurant);
          }}
          showSameAsAbove={
            photoUpload.currentPhotoIndex > 0 &&
            restaurantProcessing.processedPhotos.length > 0
          }
          // Menu item
          selectedMenuItem={restaurantProcessing.selectedMenuItem}
          menuItems={menuItems}
          menuItemName={restaurantProcessing.menuItemName}
          menuItemSearchQuery={restaurantProcessing.menuItemSearchQuery}
          menuItemSelectionMode={restaurantProcessing.menuItemSelectionMode}
          usedMenuItemNames={usedMenuItemNames}
          onMenuItemSelected={restaurantProcessing.setSelectedMenuItem}
          onMenuItemNameChange={restaurantProcessing.setMenuItemName}
          onMenuItemSearchChange={restaurantProcessing.setMenuItemSearchQuery}
          onMenuItemModeChange={restaurantProcessing.setMenuItemSelectionMode}
          // Edit menu item
          editingMenuItemId={restaurantProcessing.editingMenuItemId}
          editingMenuItemName={restaurantProcessing.editingMenuItemName}
          editingMenuItemVisibility={restaurantProcessing.editingMenuItemVisibility}
          onEditingMenuItemIdChange={restaurantProcessing.setEditingMenuItemId}
          onEditingMenuItemNameChange={
            restaurantProcessing.setEditingMenuItemName
          }
          onEditingMenuItemVisibilityChange={
            restaurantProcessing.setEditingMenuItemVisibility
          }
          onEditMenuItem={handleEditMenuItem}
          // Menu item photo
          menuItemPhotoPreview={restaurantProcessing.menuItemPhotoPreview}
          onMenuItemPhotoCapture={
            restaurantProcessing.handleMenuItemPhotoCapture
          }
          onMenuItemPhotoRemove={restaurantProcessing.handleMenuItemPhotoRemove}
          // OCR
          ocrStatus={ocrStatus}
          ocrProgress={ocrProgress}
          scannedMenuItems={scannedMenuItems}
          ocrError={ocrError}
          // Rating & notes
          rating={restaurantProcessing.rating}
          notes={restaurantProcessing.notes}
          photoDate={restaurantProcessing.photoDate}
          onRatingChange={restaurantProcessing.setRating}
          onNotesChange={restaurantProcessing.setNotes}
          onPhotoDateChange={restaurantProcessing.setPhotoDate}
          // Actions
          onCreateMenuItem={handleCreateMenuItem}
          onSubmitCurrent={handleSubmitCurrent}
          onPrevious={handlePreviousFromProcessing}
          onFullscreenPhoto={(url, name) =>
            setFullscreenPhoto({ url, dishName: name })
          }
          // UI state
          isProcessing={submission.isSubmitting}
          isKeyboardVisible={isKeyboardVisible}
          isOnline={isOnline}
          isRestoringData={draftManagement.isRestoringData}
          canSubmit={restaurantProcessing.canSubmitCurrent}
          isLegendExpanded={restaurantProcessing.isLegendExpanded}
          onLegendExpandedChange={restaurantProcessing.setIsLegendExpanded}
          // Mutations
          restaurantCreationMutation={restaurantCreationMutation}
          visitCreationMutation={visitCreationMutation}
          // Error handlers
          onShowValidation={showValidation}
          onHandleError={handleError}
          // Restaurant stats
          getRestaurantStats={getRestaurantStats}
          // Camera mode
          onOpenCamera={() => setShowCameraMode(true)}
          // Combine photos feature
          remainingPhotos={remainingPhotos}
          combinedPhotos={restaurantProcessing.combinedPhotos}
          onCombinePhoto={handleCombinePhoto}
          onUncombinePhoto={handleUncombinePhoto}
          // Note reference
          noteContent={noteData?.content}
          noteLocation={noteData?.location_text}
        />

        {/* Camera Mode Modal */}
        {showCameraMode && (
          <div className="fixed inset-0 z-50 bg-white">
            <RestaurantNameFinder
              onSelectName={(name) => {
                setRestaurantSearchQuery(name);
                setShowCameraMode(false);
              }}
              onClose={() => setShowCameraMode(false)}
            />
          </div>
        )}

        {/* Fullscreen Photo Viewer */}
        {fullscreenPhoto && (
          <div
            className="fixed inset-0 bg-black z-50 flex items-center justify-center"
            onClick={() => setFullscreenPhoto(null)}
          >
            <button
              onClick={() => setFullscreenPhoto(null)}
              className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors z-10"
              aria-label="Close fullscreen view"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="absolute top-4 left-4 text-white bg-black/50 px-3 py-2 rounded-lg">
              <p className="font-medium">{fullscreenPhoto.dishName}</p>
            </div>
            <img
              src={fullscreenPhoto.url}
              alt={fullscreenPhoto.dishName}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </>
    );
  }

  if (screen === "review") {
    if (processType === "quickTrack") {
      return (
        <QuickTrackReviewScreen
          quickTrackPhotos={quickTrackProcessing.quickTrackPhotos}
          onEdit={handleEditFromReview}
          onSubmitAll={handleSubmitAll}
          isSubmitting={submission.isSubmitting}
          isKeyboardVisible={isKeyboardVisible}
        />
      );
    }

    return (
      <RestaurantReviewScreen
        processedPhotos={restaurantProcessing.processedPhotos}
        visitVisibility={restaurantProcessing.visitVisibility}
        onVisibilityChange={restaurantProcessing.setVisitVisibility}
        onEdit={handleEditFromReview}
        onSubmitAll={handleSubmitAll}
        isSubmitting={submission.isSubmitting}
        isKeyboardVisible={isKeyboardVisible}
      />
    );
  }

  return (
    <>
      {/* Dialogs */}
      <AlertDialog open={showBackDialog} onOpenChange={setShowBackDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {backDialogType === "upload" ? "Go back?" : "Cancel processing?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {backDialogType === "upload"
                ? "You'll need to re-upload photos if you go back."
                : "Unprocessed photos will be lost. Are you sure you want to cancel?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (backDialogType === "upload") {
                  photoUpload.clearPhotos();
                  setScreen("upload");
                } else {
                  navigate({ to: "/add-visit" });
                }
                setShowBackDialog(false);
              }}
            >
              {backDialogType === "upload" ? "Go Back" : "Cancel Processing"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showRequiredFieldsDialog}
        onOpenChange={setShowRequiredFieldsDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Missing Required Fields</AlertDialogTitle>
            <AlertDialogDescription>
              Please fill in all required fields: restaurant, menu item name,
              and rating.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setShowRequiredFieldsDialog(false)}
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Camera Mode Modal */}
      {showCameraMode && (
        <div className="fixed inset-0 z-50 bg-white">
          <RestaurantNameFinder
            onSelectName={() => {
              setShowCameraMode(false);
            }}
            onClose={() => setShowCameraMode(false)}
          />
        </div>
      )}

      {/* Fullscreen Photo Viewer */}
      {fullscreenPhoto && (
        <div
          className="fixed inset-0 bg-black z-50 flex items-center justify-center"
          onClick={() => setFullscreenPhoto(null)}
        >
          <button
            onClick={() => setFullscreenPhoto(null)}
            className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors z-10"
            aria-label="Close fullscreen view"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="absolute top-4 left-4 text-white bg-black/50 px-3 py-2 rounded-lg">
            <p className="font-medium">{fullscreenPhoto.dishName}</p>
          </div>
          <img
            src={fullscreenPhoto.url}
            alt={fullscreenPhoto.dishName}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

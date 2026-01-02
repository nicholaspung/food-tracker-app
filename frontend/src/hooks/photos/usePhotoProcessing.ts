import { useState, useCallback, useRef } from "react";
import { ProcessedPhoto, PhotoToProcess } from "@/types/photos";
import { MenuItem, Restaurant } from "@/lib/pocketbase";
import { usePhotoManager } from "@/hooks/photos/usePhotoManager";

/**
 * In-progress form state for a photo (before submission)
 */
interface PhotoFormState {
  restaurant: Restaurant | null;
  menuItem: MenuItem | null;
  menuItemName: string;
  rating: number | null;
  notes: string;
  photoDate: Date;
}

/**
 * Hook for managing Restaurant Visit photo processing form state
 *
 * Handles:
 * - Restaurant selection
 * - Menu item selection/creation
 * - Rating and notes
 * - Photo date
 * - Processed photos array
 * - Menu item photo management
 * - Form validation
 * - Per-photo state preservation for back navigation
 */
export function usePhotoProcessing() {
  const [processedPhotos, setProcessedPhotos] = useState<ProcessedPhoto[]>([]);

  // Store in-progress form state per photo (for photos not yet submitted)
  const photoFormStatesRef = useRef<Map<string, PhotoFormState>>(new Map());

  // Restaurant state
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);

  // Menu item state
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [menuItemName, setMenuItemName] = useState("");
  const [menuItemSearchQuery, setMenuItemSearchQuery] = useState("");
  const [menuItemSelectionMode, setMenuItemSelectionMode] = useState<
    "search" | "scan" | "create"
  >("search");
  const [isCreatingNewItem, setIsCreatingNewItem] = useState(false);

  // Edit menu item state
  const [editingMenuItemId, setEditingMenuItemId] = useState<string | null>(null);
  const [editingMenuItemName, setEditingMenuItemName] = useState("");

  // Rating & notes
  const [rating, setRating] = useState<number | null>(3);
  const [notes, setNotes] = useState("");
  const [photoDate, setPhotoDate] = useState<Date>(new Date());

  // Visit visibility
  const [visitVisibility, setVisitVisibility] = useState<"friends" | "private">("friends");

  // Menu item photo management
  const {
    previewUrl: menuItemPhotoPreview,
    handleCapture,
    handleRemove,
  } = usePhotoManager();

  // UI state for legends
  const hasRatedBefore = localStorage.getItem("hasRatedBefore") === "true";
  const [isLegendExpanded, setIsLegendExpanded] = useState(!hasRatedBefore);

  const handleRestaurantSelected = (restaurant: Restaurant | null) => {
    setSelectedRestaurant(restaurant);
    // Clear menu item selection when restaurant changes
    setSelectedMenuItem(null);
    setMenuItemName("");
    setMenuItemSearchQuery("");
  };

  const handleMenuItemSelected = (menuItem: MenuItem | null) => {
    setSelectedMenuItem(menuItem);
    if (menuItem) {
      setMenuItemName(menuItem.name);
      setMenuItemSearchQuery("");
    }
  };

  // Save current form state for a photo (called before navigating away)
  const saveFormStateForPhoto = useCallback((photoId: string) => {
    const currentState: PhotoFormState = {
      restaurant: selectedRestaurant,
      menuItem: selectedMenuItem,
      menuItemName,
      rating,
      notes,
      photoDate,
    };
    photoFormStatesRef.current.set(photoId, currentState);
  }, [selectedRestaurant, selectedMenuItem, menuItemName, rating, notes, photoDate]);

  // Restore form state for a photo (called when navigating to a photo)
  const restoreFormStateForPhoto = useCallback((photoId: string, captureDate?: Date | null) => {
    // First check if photo was already submitted (in processedPhotos)
    const submittedPhoto = processedPhotos.find(p => p.photoId === photoId);
    if (submittedPhoto) {
      setSelectedRestaurant(submittedPhoto.restaurant);
      // We need to reconstruct a MenuItem-like object
      setSelectedMenuItem({
        id: '', // We don't have the ID, but it's not needed for display
        restaurant: submittedPhoto.restaurant.id,
        name: submittedPhoto.menuItemName,
        description: submittedPhoto.menuItemDescription,
        created: '',
        updated: '',
      } as MenuItem);
      setMenuItemName(submittedPhoto.menuItemName);
      setRating(submittedPhoto.rating);
      setNotes(submittedPhoto.notes);
      setPhotoDate(submittedPhoto.captureDate || new Date());
      setIsCreatingNewItem(submittedPhoto.isNewMenuItem);
      return;
    }

    // Then check if we have saved in-progress state
    const savedState = photoFormStatesRef.current.get(photoId);
    if (savedState) {
      setSelectedRestaurant(savedState.restaurant);
      setSelectedMenuItem(savedState.menuItem);
      setMenuItemName(savedState.menuItemName);
      setRating(savedState.rating);
      setNotes(savedState.notes);
      setPhotoDate(savedState.photoDate);
      return;
    }

    // No saved state - reset to defaults
    setSelectedRestaurant(null);
    setSelectedMenuItem(null);
    setMenuItemName("");
    setMenuItemSearchQuery("");
    setRating(3);
    setNotes("");
    setPhotoDate(captureDate || new Date());
    setIsCreatingNewItem(false);
  }, [processedPhotos]);

  const handleSubmitCurrent = async (photo: PhotoToProcess) => {
    if (!selectedRestaurant || !selectedMenuItem || rating === null) {
      return;
    }

    const processedData: ProcessedPhoto = {
      photoId: photo.id,
      photo: photo.file,
      previewUrl: photo.previewUrl, // Keep original preview URL
      restaurant: selectedRestaurant,
      menuItemName: selectedMenuItem.name,
      menuItemDescription: selectedMenuItem.description || "",
      rating,
      notes: notes.trim(),
      isNewMenuItem: isCreatingNewItem,
      captureDate: photo.captureDate || photoDate,
    };

    // Check if this photo was already submitted - update instead of add
    setProcessedPhotos((prev) => {
      const existingIndex = prev.findIndex(p => p.photoId === photo.id);
      if (existingIndex >= 0) {
        // Update existing entry
        const updated = [...prev];
        updated[existingIndex] = processedData;
        return updated;
      }
      // Add new entry
      return [...prev, processedData];
    });

    // Save that user has rated before
    localStorage.setItem("hasRatedBefore", "true");

    // Clear any in-progress state for this photo since it's now submitted
    photoFormStatesRef.current.delete(photo.id);

    // Reset form completely for next photo
    resetForm();
  };

  const resetFormExceptRestaurant = () => {
    setSelectedMenuItem(null);
    setMenuItemName("");
    setMenuItemSearchQuery("");
    setRating(3);
    setNotes("");
    setPhotoDate(new Date());
    setIsCreatingNewItem(false);
  };

  const resetForm = () => {
    setSelectedRestaurant(null);
    setSelectedMenuItem(null);
    setMenuItemName("");
    setMenuItemSearchQuery("");
    setRating(3);
    setNotes("");
    setPhotoDate(new Date());
    setIsCreatingNewItem(false);
    setMenuItemSelectionMode("search");
  };

  const canSubmitCurrent =
    selectedRestaurant !== null &&
    selectedMenuItem !== null &&
    rating !== null;

  // Update photo date when current photo changes (called from parent)
  const updateDateFromPhoto = (photo: PhotoToProcess) => {
    if (photo?.captureDate) {
      setPhotoDate(photo.captureDate);
    } else {
      setPhotoDate(new Date());
    }
  };

  return {
    // Restaurant state
    selectedRestaurant,
    setSelectedRestaurant: handleRestaurantSelected,

    // Menu item state
    selectedMenuItem,
    menuItemName,
    menuItemSearchQuery,
    menuItemSelectionMode,
    isCreatingNewItem,
    setSelectedMenuItem: handleMenuItemSelected,
    setMenuItemName,
    setMenuItemSearchQuery,
    setMenuItemSelectionMode,
    setIsCreatingNewItem,

    // Edit menu item state
    editingMenuItemId,
    editingMenuItemName,
    setEditingMenuItemId,
    setEditingMenuItemName,

    // Rating & notes
    rating,
    notes,
    photoDate,
    setRating,
    setNotes,
    setPhotoDate,

    // Visit visibility
    visitVisibility,
    setVisitVisibility,

    // Menu item photo
    menuItemPhotoPreview,
    handleMenuItemPhotoCapture: handleCapture,
    handleMenuItemPhotoRemove: handleRemove,

    // UI state
    isLegendExpanded,
    setIsLegendExpanded,

    // Processed photos
    processedPhotos,
    setProcessedPhotos, // For draft restoration

    // Actions
    handleSubmitCurrent,
    resetForm,
    resetFormExceptRestaurant,
    canSubmitCurrent,
    updateDateFromPhoto,

    // Photo navigation state management
    saveFormStateForPhoto,
    restoreFormStateForPhoto,
  };
}

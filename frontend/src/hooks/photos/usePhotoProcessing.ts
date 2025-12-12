import { useState } from "react";
import { ProcessedPhoto, PhotoToProcess } from "@/types/photos";
import { MenuItem, Restaurant } from "@/lib/pocketbase";
import { usePhotoManager } from "@/hooks/usePhotoManager";

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
 */
export function usePhotoProcessing() {
  const [processedPhotos, setProcessedPhotos] = useState<ProcessedPhoto[]>([]);

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

  const handleSubmitCurrent = async (photo: PhotoToProcess) => {
    if (!selectedRestaurant || !selectedMenuItem || rating === null) {
      return;
    }

    const processedData: ProcessedPhoto = {
      photoId: photo.id,
      photo: photo.file,
      restaurant: selectedRestaurant,
      menuItemName: selectedMenuItem.name,
      menuItemDescription: selectedMenuItem.description || "",
      rating,
      notes: notes.trim(),
      isNewMenuItem: isCreatingNewItem,
      captureDate: photo.captureDate || photoDate,
    };

    setProcessedPhotos((prev) => [...prev, processedData]);

    // Save that user has rated before
    localStorage.setItem("hasRatedBefore", "true");

    // Reset form for next photo (keep restaurant selected for convenience)
    resetFormExceptRestaurant();
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
  };
}

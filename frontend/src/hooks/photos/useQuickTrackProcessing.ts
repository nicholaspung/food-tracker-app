import { useState, useCallback, useRef } from "react";
import { QuickTrackPhotoData, PhotoToProcess } from "@/types/photos";
import { getTodayLocalDateString } from "@/lib/dateUtils";
import { format } from "date-fns";

/**
 * In-progress form state for a quick track photo (before submission)
 */
interface QuickTrackFormState {
  itemName: string;
  category: 'convenience_store' | 'packaged_food' | 'homemade' | 'recipe' | 'other' | '';
  rating: number | null;
  locationText: string;
  notes: string;
  date: string;
  visibility: "friends" | "private";
}

/**
 * Hook for managing Quick Track photo processing form state
 *
 * Handles:
 * - Quick track form state (item name, category, rating, location, notes, date, visibility)
 * - Processing quick track photos
 * - Managing quick track photos array
 * - Form validation
 */
export function useQuickTrackProcessing() {
  const [quickTrackPhotos, setQuickTrackPhotos] = useState<QuickTrackPhotoData[]>([]);

  // Store in-progress form state per photo (for photos not yet submitted)
  const photoFormStatesRef = useRef<Map<string, QuickTrackFormState>>(new Map());

  // Form state for quick track items
  const [qtItemName, setQtItemName] = useState("");
  const [qtCategory, setQtCategory] = useState<'convenience_store' | 'packaged_food' | 'homemade' | 'recipe' | 'other' | ''>("");
  const [qtRating, setQtRating] = useState<number | null>(3);
  const [qtLocationText, setQtLocationText] = useState("");
  const [qtNotes, setQtNotes] = useState("");
  const [qtDate, setQtDate] = useState(getTodayLocalDateString());
  const [qtVisibility, setQtVisibility] = useState<"friends" | "private">("friends");

  const handleSubmitCurrent = async (photo: PhotoToProcess) => {
    if (!qtItemName.trim() || qtRating === null) {
      return;
    }

    const quickTrackData: QuickTrackPhotoData = {
      photoId: photo.id,
      photo: photo.file,
      previewUrl: photo.previewUrl,
      itemName: qtItemName.trim(),
      category: qtCategory,
      rating: qtRating,
      locationText: qtLocationText.trim(),
      notes: qtNotes.trim(),
      visibility: qtVisibility,
      captureDate: photo.captureDate,
      date: qtDate, // Store the user-edited date
    };

    // Check if this photo was already submitted - update instead of add
    setQuickTrackPhotos((prev) => {
      const existingIndex = prev.findIndex(p => p.photoId === photo.id);
      if (existingIndex >= 0) {
        // Update existing entry
        const updated = [...prev];
        updated[existingIndex] = quickTrackData;
        return updated;
      }
      // Add new entry
      return [...prev, quickTrackData];
    });

    // Clear any in-progress state for this photo since it's now submitted
    photoFormStatesRef.current.delete(photo.id);

    // Reset form for next photo
    resetForm();
  };

  const resetForm = () => {
    setQtItemName("");
    setQtCategory("");
    setQtRating(3);
    setQtLocationText("");
    setQtNotes("");
    setQtDate(getTodayLocalDateString());
    setQtVisibility("friends");
  };

  const canSubmitCurrent = qtItemName.trim() !== "" && qtRating !== null;

  // Update date when photo changes (called from parent)
  const updateDateFromPhoto = (photo: PhotoToProcess) => {
    if (photo?.captureDate) {
      setQtDate(format(photo.captureDate, "yyyy-MM-dd"));
    } else {
      setQtDate(getTodayLocalDateString());
    }
  };

  // Save current form state for a photo (called before navigating away)
  const saveFormStateForPhoto = useCallback((photoId: string) => {
    const currentState: QuickTrackFormState = {
      itemName: qtItemName,
      category: qtCategory,
      rating: qtRating,
      locationText: qtLocationText,
      notes: qtNotes,
      date: qtDate,
      visibility: qtVisibility,
    };
    photoFormStatesRef.current.set(photoId, currentState);
  }, [qtItemName, qtCategory, qtRating, qtLocationText, qtNotes, qtDate, qtVisibility]);

  // Restore form state for a photo (called when navigating to a photo)
  const restoreFormStateForPhoto = useCallback((photoId: string, captureDate?: Date | null) => {
    // First check if photo was already submitted (in quickTrackPhotos)
    const submittedPhoto = quickTrackPhotos.find(p => p.photoId === photoId);
    if (submittedPhoto) {
      setQtItemName(submittedPhoto.itemName);
      setQtCategory(submittedPhoto.category);
      setQtRating(submittedPhoto.rating);
      setQtLocationText(submittedPhoto.locationText);
      setQtNotes(submittedPhoto.notes);
      setQtVisibility(submittedPhoto.visibility);
      // Use the user-edited date, not the original captureDate
      setQtDate(submittedPhoto.date);
      return;
    }

    // Then check if we have saved in-progress state
    const savedState = photoFormStatesRef.current.get(photoId);
    if (savedState) {
      setQtItemName(savedState.itemName);
      setQtCategory(savedState.category);
      setQtRating(savedState.rating);
      setQtLocationText(savedState.locationText);
      setQtNotes(savedState.notes);
      setQtDate(savedState.date);
      setQtVisibility(savedState.visibility);
      return;
    }

    // No saved state - reset to defaults
    setQtItemName("");
    setQtCategory("");
    setQtRating(3);
    setQtLocationText("");
    setQtNotes("");
    setQtVisibility("friends");
    if (captureDate) {
      setQtDate(format(captureDate, "yyyy-MM-dd"));
    } else {
      setQtDate(getTodayLocalDateString());
    }
  }, [quickTrackPhotos]);

  return {
    // State
    itemName: qtItemName,
    category: qtCategory,
    rating: qtRating,
    locationText: qtLocationText,
    notes: qtNotes,
    date: qtDate,
    visibility: qtVisibility,
    quickTrackPhotos,

    // Setters
    setItemName: setQtItemName,
    setCategory: setQtCategory,
    setRating: setQtRating,
    setLocationText: setQtLocationText,
    setNotes: setQtNotes,
    setDate: setQtDate,
    setVisibility: setQtVisibility,
    setQuickTrackPhotos, // For draft restoration

    // Actions
    handleSubmitCurrent,
    resetForm,
    canSubmitCurrent,
    updateDateFromPhoto,

    // Photo navigation state management
    saveFormStateForPhoto,
    restoreFormStateForPhoto,
  };
}

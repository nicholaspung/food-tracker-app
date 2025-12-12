import { useState } from "react";
import { QuickTrackPhotoData, PhotoToProcess } from "@/types/photos";
import { getTodayLocalDateString } from "@/lib/dateUtils";
import { format } from "date-fns";

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

  // Form state for quick track items
  const [qtItemName, setQtItemName] = useState("");
  const [qtCategory, setQtCategory] = useState("");
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
    };

    setQuickTrackPhotos((prev) => [...prev, quickTrackData]);

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
  };
}

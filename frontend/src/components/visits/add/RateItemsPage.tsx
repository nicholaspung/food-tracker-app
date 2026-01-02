import { logger } from '@/lib/logger';
import { useState, useEffect } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { localDateStringToUTC } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { visitDraftService } from "@/services/visitDraftService";
import { useScrollIntoView } from "@/hooks/ui/useScrollIntoView";
import { VisibilityToggle } from "@/components/ui/VisibilityToggle";
import { RatingSelector } from "@/components/ui/RatingSelector";
import { RatingLegend } from "@/components/ui/RatingLegend";
import { usePhotoUpload } from "@/hooks/photos/usePhotoUpload";
import { useOfflineVisitCreation } from "@/hooks/offline/useOfflineVisitCreation";
import MenuItemPhotoInput from "@/components/visits/shared/MenuItemPhotoInput";
import { useSync } from "@/contexts/SyncContext";
import { useKeyboardVisible } from "@/hooks/ui/useKeyboardVisible";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { useVisitDraftPhotoStore } from "@/stores/visitDraftPhotoStore";
import { useErrorHandler } from '@/hooks/ui/useErrorHandler';
import { isOfflineError, handleOfflineSuccess, OFFLINE_MESSAGES } from "@/lib/offlineHelpers";

interface RateItemsPageProps {
  onSubmit: () => void;
  onBack: () => void;
}

export default function RateItemsPage({
  onSubmit,
  onBack,
}: RateItemsPageProps) {
  const { showSuccess } = useErrorHandler({ source: 'RateItemsPage', autoClearMs: 5000 });
  const draft = visitDraftService.getDraft();
  const [items, setItems] = useState(draft.items);
  const [visitDate, setVisitDate] = useState(draft.visitDate);
  const [visitVisibility, setVisitVisibility] = useState(draft.visitVisibility);

  // Edit item dialog state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Photo management using persistent store (survives back navigation)
  const { photos: itemPhotos, previewUrls: photoPreviewUrls, setPhoto, removePhoto, clearAllPhotos } = useVisitDraftPhotoStore();

  // Wrap handlers to match MenuItemPhotoInput signature
  const handlePhotoCapture = (index: string | number, file: File) => {
    setPhoto(Number(index), file);
  };

  const handleRemovePhoto = (index: string | number) => {
    removePhoto(Number(index));
  };

  // Check if user has rated before - expand legend for first-timers
  const hasRatedBefore = localStorage.getItem("hasRatedBefore") === "true";

  // Ref for auto-scrolling notes input into view on mobile
  const notesInputRef = useScrollIntoView<HTMLInputElement>();

  // Photo upload hook for parallel uploads with progress
  const { state: uploadState, reset: resetUploadState } = usePhotoUpload();

  // Offline-aware visit creation
  const { isOnline } = useSync();
  const saveVisitMutation = useOfflineVisitCreation();
  const isKeyboardVisible = useKeyboardVisible();

  useEffect(() => {
    visitDraftService.saveMetadata(visitDate, visitVisibility);
  }, [visitDate, visitVisibility]);

  const handleSaveVisit = async () => {
    if (!draft.restaurant) {
      logger.error("No restaurant selected");
      return;
    }

    const user = pb.authStore.record;
    if (!user) {
      logger.error("User not authenticated");
      return;
    }

    // Convert local date to UTC before saving
    const visitDateUTC = localDateStringToUTC(visitDate);

    // Prepare food items data
    const foodItemsData = items.map((item) => ({
      name: item.menuItem.name,
      description: item.description,
      rating: item.rating,
      notes: item.notes,
    }));

    try {
      await saveVisitMutation.mutateAsync({
        restaurant: draft.restaurant.id,
        visitDate: visitDateUTC,
        visibility: visitVisibility,
        notes: "",
        foodItems: foodItemsData,
        itemPhotos,
      });

      // Success
      visitDraftService.clearDraft();
      clearAllPhotos();
      localStorage.setItem("hasRatedBefore", "true");
      resetUploadState();
      onSubmit();
    } catch (error: any) {
      logger.error("Failed to save visit:", error);
      resetUploadState();

      // Show helpful message if offline
      if (!isOnline && isOfflineError(error)) {
        handleOfflineSuccess(OFFLINE_MESSAGES.VISIT_SAVED, showSuccess);
        visitDraftService.clearDraft();
        clearAllPhotos();
        localStorage.setItem("hasRatedBefore", "true");
        onSubmit();
      }
    }
  };

  const handleUpdateItem = (
    index: number,
    field: "rating" | "notes",
    value: any
  ) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
    visitDraftService.updateItem(index, { [field]: value });
  };

  // Open edit dialog for an item
  const handleEditItem = (index: number) => {
    const item = items[index];
    setEditName(item.menuItem.name);
    setEditDescription(item.description || "");
    setEditingIndex(index);
  };

  // Save edited item
  const handleSaveEdit = () => {
    if (editingIndex === null || !editName.trim()) return;

    const newItems = [...items];
    newItems[editingIndex] = {
      ...newItems[editingIndex],
      menuItem: {
        ...newItems[editingIndex].menuItem,
        name: editName.trim(),
      },
      description: editDescription.trim(),
    };
    setItems(newItems);

    // Update in draft service
    visitDraftService.updateItem(editingIndex, { description: editDescription.trim() });

    // Close dialog
    setEditingIndex(null);
    setEditName("");
    setEditDescription("");
  };

  // Remove item from list
  const handleRemoveItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);

    // Remove associated photo if any
    removePhoto(index);

    // Update draft service - rebuild items array
    const updatedItems = newItems.map((item) => ({
      ...item.menuItem,
      description: item.description,
    }));
    visitDraftService.saveItems(updatedItems);
  };


  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Rate Your Items</h1>
        <p className="text-sm text-gray-500 mt-1">{draft.restaurant?.name}</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="space-y-4">
          {/* Date and Visibility Card */}
          {/* Date picker */}
          <DatePickerField
            value={visitDate}
            onChange={setVisitDate}
            label="Visit Date"
          />

          {/* Visibility Checkbox */}
          <VisibilityToggle
            value={visitVisibility}
            onChange={setVisitVisibility}
            entityType="visit"
          />

          {/* Collapsible Rating Legend */}
          <RatingLegend initiallyExpanded={!hasRatedBefore} />

          {items.map((item, index) => (
            <Card key={index}>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <Label className="font-semibold">{item.menuItem.name}</Label>
                    {item.description && (
                      <p className="text-sm text-gray-600 mt-1">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleEditItem(index)}
                      title="Edit item"
                    >
                      <Pencil className="h-4 w-4 text-gray-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleRemoveItem(index)}
                      title="Remove item"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Label>Rating</Label>
                  <div className="mt-2">
                    <RatingSelector
                      value={item.rating}
                      onChange={(value) =>
                        handleUpdateItem(index, "rating", value)
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Input
                    ref={notesInputRef}
                    placeholder="Add notes..."
                    value={item.notes}
                    onChange={(e) =>
                      handleUpdateItem(index, "notes", e.target.value)
                    }
                  />
                </div>

                {/* Photo capture section */}
                <MenuItemPhotoInput
                  photoKey={index}
                  newPhotoPreviewUrl={photoPreviewUrls.get(index)}
                  onPhotoCapture={handlePhotoCapture}
                  onRemoveNewPhoto={handleRemovePhoto}
                  showLabel={true}
                  showNewPhotoBadge={false}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Bottom Action Buttons */}
      {!isKeyboardVisible && (
        <div className="bg-white border-t border-gray-200 p-4">
          {/* Error display */}
          {uploadState.error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">
                <strong>Upload failed:</strong> {uploadState.error}
              </p>
              <p className="text-xs text-red-500 mt-1">
                Check the browser console for details.
              </p>
            </div>
          )}

          {/* Progress indicator for photo uploads */}
          {uploadState.status !== "idle" && uploadState.status !== "error" && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-sm font-medium ${uploadState.status === "complete" ? "text-green-700" : "text-gray-700"}`}
                >
                  {uploadState.currentOperation}
                </span>
                <span
                  className={`text-sm font-medium ${uploadState.status === "complete" ? "text-green-700" : "text-gray-700"}`}
                >
                  {uploadState.progress}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${uploadState.status === "complete" ? "bg-green-600" : "bg-blue-600"}`}
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onBack} className="flex-1">
              Back
            </Button>
            <Button
              onClick={handleSaveVisit}
              disabled={
                saveVisitMutation.isPending ||
                uploadState.status === "uploading" ||
                uploadState.status === "compressing" ||
                items.length === 0
              }
              className="flex-1"
            >
              {saveVisitMutation.isPending ? "Saving..." : "Save Visit"}
            </Button>
          </div>
        </div>
      )}

      {/* Edit Item Dialog */}
      <Dialog open={editingIndex !== null} onOpenChange={(open) => !open && setEditingIndex(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Item Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter item name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description (optional)</Label>
              <Input
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="e.g., extra spicy, no onions"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingIndex(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={!editName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

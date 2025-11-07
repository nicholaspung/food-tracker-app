import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pb } from "@/lib/pocketbase";
import { getTodayLocalDateString, localDateStringToUTC, formatLocalDateForDisplay } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, Calendar, Users, Camera, X } from "lucide-react";
import { visitDraftService } from "@/services/visitDraftService";
import { useScrollIntoView } from "@/hooks/useScrollIntoView";
import { compressDishPhoto } from "@/services/photoService";
import { RATING_OPTIONS } from "@/lib/ratingConstants";

interface RateItemsPageProps {
  onSubmit: () => void;
  onBack: () => void;
}

export default function RateItemsPage({
  onSubmit,
  onBack,
}: RateItemsPageProps) {
  const queryClient = useQueryClient();
  const draft = visitDraftService.getDraft();
  const [items, setItems] = useState(draft.items);
  const [visitDate, setVisitDate] = useState(draft.visitDate);
  const [visitVisibility, setVisitVisibility] = useState(draft.visitVisibility);
  const [showDateEdit, setShowDateEdit] = useState(false);

  // Photo state - track photo for each item (max 1 for now)
  const [itemPhotos, setItemPhotos] = useState<Map<number, File>>(new Map());
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<Map<number, string>>(new Map());
  const fileInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  // Check if user has rated before - expand legend for first-timers
  const hasRatedBefore = localStorage.getItem("hasRatedBefore") === "true";
  const [isLegendExpanded, setIsLegendExpanded] = useState(!hasRatedBefore);

  // Ref for auto-scrolling notes input into view on mobile
  const notesInputRef = useScrollIntoView<HTMLInputElement>();

  useEffect(() => {
    visitDraftService.saveMetadata(visitDate, visitVisibility);
  }, [visitDate, visitVisibility]);

  const saveVisitMutation = useMutation({
    mutationFn: async () => {
      const user = pb.authStore.record;
      if (!user || !draft.restaurant) throw new Error("Missing data");

      // Convert local date to UTC before saving
      const visitDateUTC = localDateStringToUTC(visitDate);

      const visit = await pb.collection("visits").create({
        restaurant: draft.restaurant.id,
        user: user.id,
        visitDate: visitDateUTC,
        visibility: visitVisibility,
        notes: "",
      });

      // Create food items and upload photos
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        const foodItem = await pb.collection("food_items").create({
          name: item.menuItem.name,
          description: item.description,
          visit: visit.id,
          rating: item.rating,
          notes: item.notes,
          user: user.id,
        });

        // Upload photo if exists
        const photo = itemPhotos.get(i);
        if (photo) {
          // Compress the photo before upload
          const compressedPhoto = await compressDishPhoto(photo);

          // Create visit_photo record with the compressed photo
          const formData = new FormData();
          formData.append('photo', compressedPhoto);
          formData.append('visit', visit.id);
          formData.append('food_item', foodItem.id);
          formData.append('user', user.id);

          await pb.collection("visit_photos").create(formData);
        }
      }

      return visit;
    },
    onSuccess: async () => {
      // Wait for all queries to refetch before navigating away
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["visits"] }),
        queryClient.invalidateQueries({ queryKey: ["userVisits"] }),
        queryClient.invalidateQueries({ queryKey: ["allVisits"] }),
        queryClient.invalidateQueries({ queryKey: ["allFoodItems"] }),
      ]);

      visitDraftService.clearDraft();

      // Mark that user has rated before - legend will be collapsed next time
      localStorage.setItem("hasRatedBefore", "true");

      onSubmit();
    },
  });

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

  const handlePhotoCapture = (index: number, file: File) => {
    // Store the photo file
    const newPhotos = new Map(itemPhotos);
    newPhotos.set(index, file);
    setItemPhotos(newPhotos);

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    const newPreviewUrls = new Map(photoPreviewUrls);

    // Revoke old URL if exists
    const oldUrl = newPreviewUrls.get(index);
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }

    newPreviewUrls.set(index, previewUrl);
    setPhotoPreviewUrls(newPreviewUrls);
  };

  const handleRemovePhoto = (index: number) => {
    // Remove photo file
    const newPhotos = new Map(itemPhotos);
    newPhotos.delete(index);
    setItemPhotos(newPhotos);

    // Revoke and remove preview URL
    const previewUrl = photoPreviewUrls.get(index);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const newPreviewUrls = new Map(photoPreviewUrls);
    newPreviewUrls.delete(index);
    setPhotoPreviewUrls(newPreviewUrls);
  };

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      photoPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Rate Your Items</h1>
        <p className="text-sm text-gray-500 mt-1">{draft.restaurant?.name}</p>

        {/* Date picker */}
        {visitDate && (
          <div className="mt-3">
            {!showDateEdit ? (
              <div
                className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => setShowDateEdit(true)}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">
                    {formatLocalDateForDisplay(visitDate)}
                  </span>
                </div>
                <span className="text-xs text-gray-500">Tap to change</span>
              </div>
            ) : (
              <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                <Label className="text-xs text-gray-600">Visit Date</Label>
                <Input
                  type="date"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  max={getTodayLocalDateString()}
                  className="text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDateEdit(false)}
                  className="w-full"
                >
                  Done
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Visibility Checkbox */}
        <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={visitVisibility === "friends"}
              onChange={(e) =>
                setVisitVisibility(e.target.checked ? "friends" : "private")
              }
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium">
                  Friends can view this visit
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {visitVisibility === "friends"
                  ? "Your friends will be able to see this visit and your ratings"
                  : "Only you will be able to see this visit"}
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Collapsible Rating Legend */}
          <Card className="border-2 border-blue-200 bg-blue-50/30 py-4">
            <CardContent className="px-4">
              <button
                onClick={() => setIsLegendExpanded(!isLegendExpanded)}
                className="w-full flex items-center justify-between"
              >
                <Label className="text-sm font-semibold text-gray-700 cursor-pointer">
                  Rating Guide
                </Label>
                {isLegendExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-600" />
                )}
              </button>
              {isLegendExpanded && (
                <div className="space-y-2 mt-3">
                  {RATING_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-center gap-3">
                      <div
                        className={`${option.color} text-white w-8 h-8 rounded-md flex items-center justify-center font-bold text-sm flex-shrink-0`}
                      >
                        {option.value}
                      </div>
                      <span className="text-sm text-gray-700">
                        {option.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {items.map((item, index) => (
            <Card key={index}>
              <CardContent className="space-y-3">
                <div>
                  <Label className="font-semibold">{item.menuItem.name}</Label>
                  {item.description && (
                    <p className="text-sm text-gray-600 mt-1">
                      {item.description}
                    </p>
                  )}
                </div>

                <div>
                  <Label>Rating</Label>
                  <div className="grid grid-cols-5 gap-2 mt-2">
                    {RATING_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() =>
                          handleUpdateItem(index, "rating", option.value)
                        }
                        className={`p-3 rounded-lg text-white text-center text-xs font-medium transition-all ${
                          option.color
                        } ${
                          item.rating === option.value
                            ? "ring-2 ring-offset-2 ring-blue-500"
                            : "opacity-60 hover:opacity-100"
                        }`}
                      >
                        {option.value}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-600 mt-2 text-center">
                    {RATING_OPTIONS.find((o) => o.value === item.rating)?.label}
                  </p>
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
                <div className="space-y-2">
                  <Label>Photo (optional)</Label>

                  {!photoPreviewUrls.has(index) ? (
                    <>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={(el) => {
                          if (el) fileInputRefs.current.set(index, el);
                        }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handlePhotoCapture(index, file);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => fileInputRefs.current.get(index)?.click()}
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Add Photo
                      </Button>
                      <p className="text-xs text-gray-500 text-center">
                        Take a photo or choose from your library
                      </p>
                    </>
                  ) : (
                    <div className="relative">
                      <img
                        src={photoPreviewUrls.get(index)}
                        alt="Dish preview"
                        className="w-full h-48 object-cover rounded-lg"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => handleRemovePhoto(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Bottom Action Buttons */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button
            onClick={() => saveVisitMutation.mutate()}
            disabled={saveVisitMutation.isPending}
            className="flex-1"
          >
            {saveVisitMutation.isPending ? "Saving..." : "Save Visit"}
          </Button>
        </div>
      </div>
    </div>
  );
}

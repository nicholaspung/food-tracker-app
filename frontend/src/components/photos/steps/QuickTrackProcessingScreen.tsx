import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { PhotoToProcess } from "@/types/photos";
import { RATING_OPTIONS } from "@/lib/ratingConstants";
import { RatingSelector } from "@/components/ui/RatingSelector";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { VisibilityToggle } from "@/components/ui/VisibilityToggle";
import { ITEM_CATEGORIES } from "@/constants/quickTrack";

interface QuickTrackProcessingScreenProps {
  // Photo data
  currentPhoto: PhotoToProcess;
  currentPhotoIndex: number;
  totalPhotos: number;

  // Form state
  itemName: string;
  category: string;
  rating: number | null;
  locationText: string;
  notes: string;
  date: string;
  visibility: "friends" | "private";

  // Form handlers
  onItemNameChange: (name: string) => void;
  onCategoryChange: (cat: string) => void;
  onRatingChange: (r: number | null) => void;
  onLocationTextChange: (loc: string) => void;
  onNotesChange: (notes: string) => void;
  onDateChange: (date: string) => void;
  onVisibilityChange: (v: "friends" | "private") => void;

  // Actions
  onSubmitCurrent: () => void;
  onBack: () => void;
  onFullscreenPhoto: (url: string, name: string) => void;

  // UI state
  isKeyboardVisible: boolean;
  canSubmit: boolean;
}

/**
 * Quick Track Processing Screen - Form for processing quick track photos
 */
export function QuickTrackProcessingScreen({
  currentPhoto,
  currentPhotoIndex,
  totalPhotos,
  itemName,
  category,
  rating,
  locationText,
  notes,
  date,
  visibility,
  onItemNameChange,
  onCategoryChange,
  onRatingChange,
  onLocationTextChange,
  onNotesChange,
  onDateChange,
  onVisibilityChange,
  onSubmitCurrent,
  onBack,
  onFullscreenPhoto,
  isKeyboardVisible,
  canSubmit,
}: QuickTrackProcessingScreenProps) {
  const hasRatedBefore = localStorage.getItem("hasRatedBefore") === "true";
  const [isLegendExpanded, setIsLegendExpanded] = useState(!hasRatedBefore);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Quick Track Item</h1>
        <p className="text-sm text-gray-500 mt-1">
          Photo {currentPhotoIndex + 1} of {totalPhotos}
        </p>

        {/* Progress bar */}
        <div className="h-1 bg-gray-200 rounded-full mt-3">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-300"
            style={{
              width: `${((currentPhotoIndex + 1) / totalPhotos) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Photo Preview */}
        <div className="mb-4" key={currentPhoto.id}>
          <div className="relative aspect-video rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity">
            <img
              src={currentPhoto.previewUrl}
              alt="Food photo"
              className="w-full h-full object-contain"
              onClick={() =>
                onFullscreenPhoto(currentPhoto.previewUrl, itemName || "Photo")
              }
            />
          </div>
        </div>

        {/* Quick Track Form - Matching QuickTrackPage layout */}

        {/* Date picker */}
        <DatePickerField value={date} onChange={onDateChange} label="Date" />

        {/* Visibility Section */}
        <VisibilityToggle
          value={visibility}
          onChange={onVisibilityChange}
          entityType="item"
        />

        {/* Item Name */}
        <Card>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="qtItemName" className="font-semibold">
                Item Name *
              </Label>
              <Input
                id="qtItemName"
                type="text"
                value={itemName}
                onChange={(e) => onItemNameChange(e.target.value)}
                placeholder="e.g., Chocolate Bar, Coffee, Homemade Pasta"
                maxLength={200}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Rating Legend */}
        <Card className="border-2 border-blue-200 bg-blue-50/30 py-4">
          <CardContent className="px-4">
            <button
              type="button"
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

        {/* Rating */}
        <Card>
          <CardContent className="space-y-3">
            <div>
              <Label className="font-semibold">Rating *</Label>
              <div className="mt-2">
                <RatingSelector value={rating} onChange={onRatingChange} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Category, Location, and Notes Section */}
        <Card>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="qtCategory" className="font-semibold">
                Category (Optional)
              </Label>
              <Select value={category} onValueChange={onCategoryChange}>
                <SelectTrigger id="qtCategory">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="qtLocation" className="font-semibold">
                Location (Optional)
              </Label>
              <Input
                id="qtLocation"
                type="text"
                value={locationText}
                onChange={(e) => onLocationTextChange(e.target.value)}
                placeholder="e.g., 7-Eleven on Main St, Trader Joe's"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qtNotes" className="font-semibold">
                Notes (Optional)
              </Label>
              <Textarea
                id="qtNotes"
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="Any additional thoughts or details..."
                maxLength={1000}
                rows={3}
                className="resize-none"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      {!isKeyboardVisible && (
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex gap-3">
            <Button variant="outline" onClick={onBack} className="flex-1">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={onSubmitCurrent}
              disabled={!canSubmit}
              className="flex-1"
            >
              {currentPhotoIndex < totalPhotos - 1 ? "Next" : "Review"}
              {currentPhotoIndex < totalPhotos - 1 && (
                <ChevronRight className="ml-2 h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

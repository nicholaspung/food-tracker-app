import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { RatingSelector } from '@/components/ui/RatingSelector';
import { RatingLegend } from '@/components/ui/RatingLegend';
import { useSubmitTastingRating } from '@/hooks/api/useTastingSessions';
import type { TastingSessionItem, TastingSessionRating } from '@/lib/pocketbase';

interface RateSessionItemsViewProps {
  sessionId: string;
  items: TastingSessionItem[];
  ratings: TastingSessionRating[];
  currentUserId: string;
}

export default function RateSessionItemsView({
  sessionId,
  items,
  ratings,
  currentUserId,
}: RateSessionItemsViewProps) {
  const submitRating = useSubmitTastingRating();

  // Build a map of current user's ratings by item ID
  const myRatings = new Map(
    ratings
      .filter(r => r.user === currentUserId)
      .map(r => [r.item, r])
  );

  const ratedCount = myRatings.size;
  const totalCount = items.length;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="bg-white rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-gray-900">Your Ratings</h3>
          <span className="text-sm text-gray-500">
            {ratedCount} of {totalCount} rated
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-purple-600 h-2 rounded-full transition-all"
            style={{ width: `${totalCount > 0 ? (ratedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Rating Legend */}
      <RatingLegend />

      {/* Items to rate */}
      {items.map((item) => (
        <RateItemCard
          key={item.id}
          sessionId={sessionId}
          item={item}
          existingRating={myRatings.get(item.id)}
          onSubmit={submitRating}
        />
      ))}
    </div>
  );
}

interface RateItemCardProps {
  sessionId: string;
  item: TastingSessionItem;
  existingRating?: TastingSessionRating;
  onSubmit: ReturnType<typeof useSubmitTastingRating>;
}

function RateItemCard({ sessionId, item, existingRating, onSubmit }: RateItemCardProps) {
  const [rating, setRating] = useState<number | null>(existingRating?.rating ?? null);
  const [notes, setNotes] = useState(existingRating?.notes || '');
  const [expanded, setExpanded] = useState(!existingRating);
  const [saved, setSaved] = useState(!!existingRating);

  const handleSave = async () => {
    if (rating === null) return;
    try {
      await onSubmit.mutateAsync({
        sessionId,
        itemId: item.id,
        rating,
        notes: notes.trim() || undefined,
      });
      setSaved(true);
      setExpanded(false);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="bg-white rounded-lg overflow-hidden">
      <button
        className="w-full p-4 flex items-center justify-between text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900 truncate">{item.name}</p>
            {saved && <Check className="w-4 h-4 text-green-600 flex-shrink-0" />}
          </div>
          {item.description && (
            <p className="text-sm text-gray-500 truncate">{item.description}</p>
          )}
          {saved && rating !== null && (
            <p className="text-xs text-purple-600 mt-1">Rated: {rating}/5</p>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          <div>
            <Label className="text-sm text-gray-700 mb-2 block">Rating</Label>
            <RatingSelector
              value={rating}
              onChange={(value) => setRating(value)}
            />
          </div>
          <div>
            <Label className="text-sm text-gray-700 mb-1 block">Notes (optional)</Label>
            <Input
              placeholder="Any thoughts about this item?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-sm"
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={rating === null || onSubmit.isPending}
            className="w-full bg-purple-600 hover:bg-purple-700"
            size="sm"
          >
            {onSubmit.isPending ? 'Saving...' : saved ? 'Update Rating' : 'Save Rating'}
          </Button>
        </div>
      )}
    </div>
  );
}

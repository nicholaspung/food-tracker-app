import { useState, useMemo } from 'react';
import { TrendingUp, AlertTriangle, Save, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getRatingColor, getRatingLabel } from '@/constants/ratings';
import { useSaveToVisitHistory } from '@/hooks/api/useTastingSessions';
import { useErrorHandler } from '@/hooks/ui/useErrorHandler';
import type { TastingSessionWithDetails } from '@/lib/tastingSessionService';

interface TastingSessionResultsViewProps {
  session: TastingSessionWithDetails;
  currentUserId: string;
}

interface ItemResult {
  itemId: string;
  name: string;
  description?: string;
  myRating: number | null;
  groupAverage: number;
  allRatings: Array<{ userName: string; rating: number; notes?: string }>;
  spread: number; // max - min rating
}

export default function TastingSessionResultsView({
  session,
  currentUserId,
}: TastingSessionResultsViewProps) {
  const [savedToVisits, setSavedToVisits] = useState(false);
  const saveToVisits = useSaveToVisitHistory();
  const { error, handleError, clearError } = useErrorHandler({ source: 'TastingResults' });

  // Build participant name map
  const participantNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of session.participants) {
      map.set(p.user, p.expand?.user?.name || p.expand?.user?.email || 'Unknown');
    }
    return map;
  }, [session.participants]);

  // Compute item results
  const itemResults: ItemResult[] = useMemo(() => {
    return session.items.map(item => {
      const itemRatings = session.ratings.filter(r => r.item === item.id);
      const myRating = itemRatings.find(r => r.user === currentUserId)?.rating ?? null;
      const ratingValues = itemRatings.map(r => r.rating);
      const groupAverage = ratingValues.length > 0
        ? ratingValues.reduce((sum, r) => sum + r, 0) / ratingValues.length
        : 0;
      const spread = ratingValues.length > 0
        ? Math.max(...ratingValues) - Math.min(...ratingValues)
        : 0;

      const allRatings = itemRatings.map(r => ({
        userName: participantNames.get(r.user) || 'Unknown',
        rating: r.rating,
        notes: r.notes,
      }));

      return {
        itemId: item.id,
        name: item.name,
        description: item.description,
        myRating,
        groupAverage,
        allRatings,
        spread,
      };
    });
  }, [session.items, session.ratings, currentUserId, participantNames]);

  // Highlights
  const groupFavorites = itemResults.filter(r => r.groupAverage >= 4).sort((a, b) => b.groupAverage - a.groupAverage);
  const controversial = itemResults.filter(r => r.spread >= 3).sort((a, b) => b.spread - a.spread);

  const handleSaveToVisits = async () => {
    clearError();
    try {
      await saveToVisits.mutateAsync(session.id);
      setSavedToVisits(true);
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 text-red-800 rounded-lg text-sm">
          {error.message}
        </div>
      )}

      {/* Group Favorites */}
      {groupFavorites.length > 0 && (
        <div className="bg-green-50 rounded-lg p-4">
          <h3 className="font-medium text-green-800 mb-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Group Favorites
          </h3>
          <div className="space-y-1">
            {groupFavorites.map(item => (
              <div key={item.itemId} className="flex items-center justify-between">
                <span className="text-sm text-green-700">{item.name}</span>
                <span className="text-sm font-medium text-green-800">
                  {item.groupAverage.toFixed(1)} avg
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controversial */}
      {controversial.length > 0 && (
        <div className="bg-orange-50 rounded-lg p-4">
          <h3 className="font-medium text-orange-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Controversial (spread 3+)
          </h3>
          <div className="space-y-1">
            {controversial.map(item => (
              <div key={item.itemId} className="flex items-center justify-between">
                <span className="text-sm text-orange-700">{item.name}</span>
                <span className="text-sm font-medium text-orange-800">
                  spread: {item.spread}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Item Results */}
      {itemResults.map(result => (
        <ResultItemCard key={result.itemId} result={result} />
      ))}

      {/* Save to Visits */}
      <div className="pt-2">
        {savedToVisits ? (
          <Button disabled className="w-full bg-green-600">
            <Check className="w-4 h-4 mr-2" />
            Saved to My Visits
          </Button>
        ) : (
          <Button
            onClick={handleSaveToVisits}
            disabled={saveToVisits.isPending}
            className="w-full"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveToVisits.isPending ? 'Saving...' : 'Save to My Visits'}
          </Button>
        )}
      </div>
    </div>
  );
}

function ResultItemCard({ result }: { result: ItemResult }) {
  const [expanded, setExpanded] = useState(false);
  const avgRounded = Math.round(result.groupAverage);

  return (
    <div className="bg-white rounded-lg overflow-hidden">
      <button
        className="w-full p-4 flex items-center justify-between text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{result.name}</p>
          <div className="flex items-center gap-3 mt-1">
            {result.myRating !== null && (
              <span className="text-xs text-gray-500">
                You: <span className="font-medium">{result.myRating}/5</span>
              </span>
            )}
            <span className="text-xs text-gray-500">
              Avg: <span className="font-medium">{result.groupAverage.toFixed(1)}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${getRatingColor(avgRounded)}`}>
            {result.groupAverage.toFixed(1)}
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t pt-3 space-y-2">
          <p className="text-xs text-gray-500 font-medium">
            {getRatingLabel(avgRounded)}
          </p>
          {result.allRatings.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{r.userName}</span>
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded flex items-center justify-center text-white text-xs font-medium ${getRatingColor(r.rating)}`}>
                  {r.rating}
                </div>
                {r.notes && (
                  <span className="text-xs text-gray-400 max-w-[150px] truncate">
                    {r.notes}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

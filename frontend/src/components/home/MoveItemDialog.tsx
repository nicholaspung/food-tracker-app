import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useVisits } from '@/hooks/api/useVisits';
import { useOfflineFoodItemMove } from '@/hooks/offline/useOfflineFoodItemMove';
import { useErrorHandler } from '@/hooks/ui/useErrorHandler';
import { pb } from '@/lib/pocketbase';
import type { FoodItem, Visit, Restaurant } from '@/lib/pocketbase';
import { Search, MapPin, Calendar, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { LoadingState } from '@/components/ui/LoadingState';

interface MoveItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foodItem: FoodItem;
  currentVisitId: string;
  onSuccess?: () => void;
}

interface VisitWithRestaurant extends Visit {
  expand?: {
    restaurant?: Restaurant;
  };
}

/**
 * Dialog for moving a food item to a different visit.
 * Shows all user's visits (excluding current) grouped by restaurant.
 */
export function MoveItemDialog({
  open,
  onOpenChange,
  foodItem,
  currentVisitId,
  onSuccess,
}: MoveItemDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { handleError, showSuccess } = useErrorHandler({ source: 'MoveItemDialog' });

  const userId = pb.authStore.record?.id;

  // Fetch all user's visits with restaurant expansion
  const { data: visits = [], isLoading } = useVisits({
    expand: 'restaurant',
    filter: userId ? `user = "${userId}"` : undefined,
    sort: '-visitDate',
  });

  const moveFoodItem = useOfflineFoodItemMove();

  // Filter and group visits
  const filteredVisits = useMemo(() => {
    const visitsWithRestaurant = visits as VisitWithRestaurant[];

    return visitsWithRestaurant
      .filter((visit) => {
        // Exclude current visit
        if (visit.id === currentVisitId) return false;

        // Filter by search query
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          const restaurantName = visit.expand?.restaurant?.name?.toLowerCase() || '';
          const restaurantLocation = visit.expand?.restaurant?.location?.toLowerCase() || '';
          return restaurantName.includes(query) || restaurantLocation.includes(query);
        }

        return true;
      });
  }, [visits, currentVisitId, searchQuery]);

  // Group by restaurant for display
  const groupedByRestaurant = useMemo(() => {
    const groups = new Map<string, { restaurant: Restaurant | undefined; visits: VisitWithRestaurant[] }>();

    filteredVisits.forEach((visit) => {
      const restaurantId = visit.restaurant || 'unknown';
      const existing = groups.get(restaurantId);

      if (existing) {
        existing.visits.push(visit);
      } else {
        groups.set(restaurantId, {
          restaurant: visit.expand?.restaurant,
          visits: [visit],
        });
      }
    });

    return Array.from(groups.values());
  }, [filteredVisits]);

  const handleSelectVisit = async (targetVisitId: string) => {
    try {
      await moveFoodItem.mutateAsync({
        foodItemId: foodItem.id,
        targetVisitId,
      });

      showSuccess('Item moved successfully');
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      handleError(err, { customMessage: 'Failed to move item' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle>Move "{foodItem.name}"</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            Select a visit to move this item to
          </p>
        </DialogHeader>

        {/* Search */}
        <div className="px-4 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search restaurants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Visit list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <LoadingState message="Loading visits..." />
          ) : filteredVisits.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {searchQuery ? (
                <p>No visits found matching "{searchQuery}"</p>
              ) : (
                <p>No other visits available</p>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {groupedByRestaurant.map(({ restaurant, visits: restaurantVisits }) => (
                <div key={restaurant?.id || 'unknown'}>
                  {/* Restaurant header */}
                  <div className="px-4 py-2 bg-gray-50 sticky top-0">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900">
                        {restaurant?.name || 'Unknown Restaurant'}
                      </span>
                    </div>
                    {restaurant?.location && (
                      <p className="text-xs text-gray-500 ml-6">{restaurant.location}</p>
                    )}
                  </div>

                  {/* Visits for this restaurant */}
                  {restaurantVisits.map((visit) => (
                    <button
                      key={visit.id}
                      onClick={() => handleSelectVisit(visit.id)}
                      disabled={moveFoodItem.isPending}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <div className="text-left">
                          <p className="text-sm font-medium text-gray-900">
                            {format(new Date(visit.visitDate), 'MMM d, yyyy')}
                          </p>
                          {visit.notes && (
                            <p className="text-xs text-gray-500 truncate max-w-[200px]">
                              {visit.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

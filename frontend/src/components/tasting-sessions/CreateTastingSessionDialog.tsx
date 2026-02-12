import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, MapPin } from 'lucide-react';
import { useCreateTastingSession } from '@/hooks/api/useTastingSessions';
import { useErrorHandler } from '@/hooks/ui/useErrorHandler';
import { repositories } from '@/repositories';
import type { Restaurant } from '@/lib/pocketbase';

interface CreateTastingSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (sessionId: string) => void;
}

export default function CreateTastingSessionDialog({
  open,
  onClose,
  onSuccess,
}: CreateTastingSessionDialogProps) {
  const [name, setName] = useState('');
  const [restaurantQuery, setRestaurantQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Restaurant[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const createSession = useCreateTastingSession();
  const { error, handleError, clearError } = useErrorHandler({ source: 'CreateTastingSession' });

  const handleSearch = async () => {
    if (!restaurantQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await repositories.restaurants.getFullList({
        filter: `name ~ "${restaurantQuery}"`,
        sort: '-created',
      });
      setSearchResults(results.slice(0, 10));
    } catch (err) {
      handleError(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCreate = async () => {
    clearError();
    if (!name.trim()) {
      handleError(new Error('Session name is required'));
      return;
    }
    if (!selectedRestaurant) {
      handleError(new Error('Please select a restaurant'));
      return;
    }

    try {
      const result = await createSession.mutateAsync({
        name: name.trim(),
        restaurant: selectedRestaurant.id,
      });
      // Reset form
      setName('');
      setRestaurantQuery('');
      setSearchResults([]);
      setSelectedRestaurant(null);
      onSuccess(result.session.id);
    } catch (err) {
      handleError(err);
    }
  };

  const handleClose = () => {
    setName('');
    setRestaurantQuery('');
    setSearchResults([]);
    setSelectedRestaurant(null);
    clearError();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>Create Tasting Session</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-800 rounded-lg text-sm">
              {error.message}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="session-name">Session Name</Label>
            <Input
              id="session-name"
              placeholder='e.g., "Saturday Dim Sum"'
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Restaurant</Label>
            {selectedRestaurant ? (
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
                <div>
                  <p className="font-medium text-gray-900">{selectedRestaurant.name}</p>
                  {selectedRestaurant.location && (
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {selectedRestaurant.location}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedRestaurant(null)}
                >
                  Change
                </Button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search restaurants..."
                    value={restaurantQuery}
                    onChange={(e) => setRestaurantQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={handleSearch}
                    disabled={isSearching || !restaurantQuery.trim()}
                  >
                    <Search className="w-4 h-4" />
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border rounded-lg">
                    {searchResults.map((restaurant) => (
                      <button
                        key={restaurant.id}
                        className="w-full text-left p-3 hover:bg-gray-50 border-b last:border-b-0"
                        onClick={() => {
                          setSelectedRestaurant(restaurant);
                          setSearchResults([]);
                        }}
                      >
                        <p className="font-medium text-sm">{restaurant.name}</p>
                        {restaurant.location && (
                          <p className="text-xs text-gray-500">{restaurant.location}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createSession.isPending || !name.trim() || !selectedRestaurant}
              className="flex-1"
            >
              {createSession.isPending ? 'Creating...' : 'Create Session'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

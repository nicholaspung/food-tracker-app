import { ChefHat, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeleteTastingItem } from '@/hooks/api/useTastingSessions';
import type { TastingSessionItem } from '@/lib/pocketbase';

interface TastingItemsListProps {
  items: TastingSessionItem[];
  currentUserId: string;
  isLeader: boolean;
  sessionId: string;
  canDelete: boolean;
}

export default function TastingItemsList({
  items,
  currentUserId,
  isLeader,
  sessionId,
  canDelete,
}: TastingItemsListProps) {
  const deleteItem = useDeleteTastingItem();

  if (!items || items.length === 0) {
    return (
      <div className="bg-white rounded-lg p-6 text-center">
        <ChefHat className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No items added yet</p>
        <p className="text-xs text-gray-400 mt-1">Add food items that everyone will rate</p>
      </div>
    );
  }

  const handleDelete = async (itemId: string) => {
    try {
      await deleteItem.mutateAsync({ itemId, sessionId });
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="bg-white rounded-lg">
      <div className="p-4 border-b">
        <h3 className="font-medium text-gray-900">Items ({items.length})</h3>
      </div>
      <div className="divide-y">
        {items.map((item) => {
          const addedByName = item.expand?.added_by?.name || item.expand?.added_by?.email || 'Unknown';
          const canDeleteItem = canDelete && (item.added_by === currentUserId || isLeader);

          return (
            <div key={item.id} className="p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{item.name}</p>
                {item.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">Added by {addedByName}</p>
              </div>
              {canDeleteItem && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(item.id)}
                  disabled={deleteItem.isPending}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

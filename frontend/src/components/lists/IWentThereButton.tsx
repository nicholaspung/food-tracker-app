import { useNavigate } from '@tanstack/react-router';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { visitDraftService } from '@/services/visitDraftService';
import type { ListItem, FoodItem, Restaurant } from '@/lib/pocketbase';

interface IWentThereButtonProps {
  listItem: ListItem;
  foodItem: FoodItem;
  restaurant: Restaurant;
  className?: string;
}

/**
 * Button to start the "I went there" flow for a bookmarked item.
 * Prepopulates the visit draft with restaurant and food item info,
 * then navigates directly to the rate-items page.
 */
export function IWentThereButton({
  listItem,
  foodItem,
  restaurant,
  className = '',
}: IWentThereButtonProps) {
  const navigate = useNavigate();

  // Don't show if user has already visited and rated this item
  if (listItem.userFoodItem) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Prepopulate the visit draft with bookmark data
    visitDraftService.prepopulateFromBookmark({
      restaurant,
      foodItemName: foodItem.name,
      foodItemDescription: foodItem.description,
      listItemId: listItem.id,
    });

    // Navigate directly to rate-items page
    navigate({ to: '/add-visit/rate-items' });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`h-6 px-2 text-xs text-green-700 hover:text-green-800 hover:bg-green-50 ${className}`}
      onClick={handleClick}
      title="I went there - rate this item"
    >
      <MapPin className="w-3 h-3 mr-1" />
      I went
    </Button>
  );
}

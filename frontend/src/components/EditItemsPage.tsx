import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pb, Restaurant, FoodItem, MenuItem as DBMenuItem } from '@/lib/pocketbase';
import { utcToLocalDateString } from '@/lib/dateUtils';
import { editVisitDraftService } from '@/services/editVisitDraftService';
import AddItemsToVisit from '@/components/AddItemsToVisit';
import { Button } from '@/components/ui/button';

interface EditItemsPageProps {
  visitId: string;
  onNext: () => void;
  onCancel: () => void;
}

export default function EditItemsPage({ visitId, onNext, onCancel }: EditItemsPageProps) {
  const [initialMenuItems, setInitialMenuItems] = useState<DBMenuItem[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [visitDate, setVisitDate] = useState('');
  const [visitVisibility, setVisitVisibility] = useState<'friends' | 'private'>('friends');

  // Fetch visit data
  const { data: visit, isLoading: visitLoading } = useQuery({
    queryKey: ['visit', visitId],
    queryFn: async () => {
      return await pb.collection('visits').getOne(visitId);
    },
  });

  // Fetch restaurant
  const { data: restaurant, isLoading: restaurantLoading } = useQuery({
    queryKey: ['restaurant', visit?.restaurant],
    queryFn: async () => {
      if (!visit?.restaurant) return null;
      return await pb.collection('restaurants').getOne<Restaurant>(visit.restaurant);
    },
    enabled: !!visit?.restaurant,
  });

  // Fetch existing food items
  const { data: existingFoodItems = [], isLoading: foodItemsLoading } = useQuery<FoodItem[]>({
    queryKey: ['foodItems', visitId],
    queryFn: async () => {
      const items = await pb.collection('food_items').getFullList<FoodItem>({
        filter: `visit = "${visitId}"`,
        sort: 'created',
      });
      return items;
    },
  });

  // Fetch all menu items for the restaurant
  const { data: restaurantMenuItems = [], isLoading: menuItemsLoading } = useQuery<DBMenuItem[]>({
    queryKey: ['menuItems', restaurant?.id],
    queryFn: async () => {
      if (!restaurant?.id) return [];
      return await pb.collection('menu_items').getFullList<DBMenuItem>({
        filter: `restaurant = "${restaurant.id}"`,
        sort: '-created',
      });
    },
    enabled: !!restaurant?.id,
  });

  // Initialize when all data is loaded
  useEffect(() => {
    if (visit && restaurant && !foodItemsLoading && !menuItemsLoading) {
      setSelectedRestaurant(restaurant);

      // Check if we have a draft
      const draft = editVisitDraftService.getDraft(visitId);

      if (draft) {
        // Use draft data - match with real menu items
        const menuItemsMap = new Map(restaurantMenuItems.map(mi => [mi.name.toLowerCase(), mi]));
        const draftMenuItems: DBMenuItem[] = draft.menuItems
          .filter(item => !item._deleted)
          .map(item => {
            // Try to find matching menu item by name
            const matchingMenuItem = menuItemsMap.get(item.name.toLowerCase());
            if (matchingMenuItem) {
              // Use the real menu item but preserve user's custom description from draft
              return {
                ...matchingMenuItem,
                description: item.description || matchingMenuItem.description || '',
              };
            } else {
              // Create temporary menu item for items that don't exist in menu_items table
              return {
                id: `temp-${item.name}-${Date.now()}`,
                name: item.name,
                description: item.description || '',
                restaurant: restaurant.id,
                collectionId: 'menu_items',
                collectionName: 'menu_items',
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
              };
            }
          });
        setInitialMenuItems(draftMenuItems);
        setVisitDate(draft.visitDate);
        setVisitVisibility(draft.visitVisibility);
      } else {
        // Match existing food items with real menu items by name
        const menuItemsMap = new Map(restaurantMenuItems.map(mi => [mi.name.toLowerCase(), mi]));
        const matchedMenuItems: DBMenuItem[] = existingFoodItems.map(foodItem => {
          const matchingMenuItem = menuItemsMap.get(foodItem.name.toLowerCase());
          if (matchingMenuItem) {
            // Use the real menu item but preserve user's custom description
            return {
              ...matchingMenuItem,
              // Preserve the user's custom description from the food item
              // Use a custom field so AddItemsToVisit can access it
              description: foodItem.description || matchingMenuItem.description || '',
            } as DBMenuItem & { userDescription?: string };
          } else {
            // Create temporary menu item for items that don't exist in menu_items table
            return {
              id: `temp-${foodItem.name}-${Date.now()}`,
              name: foodItem.name,
              description: foodItem.description || '',
              restaurant: restaurant.id,
              collectionId: 'menu_items',
              collectionName: 'menu_items',
              created: foodItem.created,
              updated: foodItem.updated,
            };
          }
        });
        setInitialMenuItems(matchedMenuItems);

        // Initialize date and visibility
        const localDate = utcToLocalDateString(visit.visitDate);
        setVisitDate(localDate);
        setVisitVisibility(visit.visibility || 'friends');

        // Initialize draft with current visit data
        editVisitDraftService.saveDraft({
          visitId,
          restaurant,
          menuItems: existingFoodItems.map(item => ({
            id: item.id,
            name: item.name,
            description: item.description || '',
            rating: item.rating,
            notes: item.notes || '',
          })),
          visitDate: localDate,
          visitVisibility: visit.visibility || 'friends',
          step: 1,
        });
      }

      setIsReady(true);
    }
  }, [visit, restaurant, existingFoodItems, restaurantMenuItems, foodItemsLoading, menuItemsLoading, visitId]);

  // Save date and visibility changes to draft
  useEffect(() => {
    const draft = editVisitDraftService.getDraft(visitId);
    if (draft && selectedRestaurant) {
      editVisitDraftService.saveDraft({
        ...draft,
        visitDate,
        visitVisibility,
      });
    }
  }, [visitDate, visitVisibility, visitId, selectedRestaurant]);

  const handleComplete = (selectedItems: DBMenuItem[]) => {
    if (!selectedRestaurant || !visit) return;

    // Get existing draft (if any) to preserve rating/notes changes
    const existingDraft = editVisitDraftService.getDraft(visitId);
    const existingDraftItemsMap = existingDraft
      ? new Map(existingDraft.menuItems.filter(i => !i._deleted).map(item => [item.name, item]))
      : new Map();

    // Get existing food items map for matching IDs
    const existingItemsMap = new Map(existingFoodItems.map(item => [item.name, item]));

    // Convert selected items to EditVisitDraftItem format
    const draftItems: Array<{
      id?: string;
      name: string;
      description: string;
      rating: number;
      notes: string;
      _deleted?: boolean;
    }> = selectedItems.map(item => {
      const draftItem = existingDraftItemsMap.get(item.name);
      const existingItem = existingItemsMap.get(item.name);
      // Check for userDescription (custom description from AddItemsToVisit) first
      const itemWithUserDesc = item as DBMenuItem & { userDescription?: string };
      return {
        id: draftItem?.id || existingItem?.id, // Preserve ID from draft or existing item
        name: item.name,
        description: itemWithUserDesc.userDescription || item.description || '',
        // Priority: draft rating/notes > existing item > defaults
        rating: draftItem?.rating ?? existingItem?.rating ?? 3,
        notes: draftItem?.notes ?? existingItem?.notes ?? '',
      };
    });

    // Mark items that were deleted (in original but not in selected)
    const selectedNames = new Set(selectedItems.map(i => i.name));
    existingFoodItems.forEach(item => {
      if (!selectedNames.has(item.name)) {
        draftItems.push({
          id: item.id,
          name: item.name,
          description: item.description || '',
          rating: item.rating,
          notes: item.notes || '',
          _deleted: true,
        });
      }
    });

    // Save to draft
    editVisitDraftService.saveDraft({
      visitId,
      restaurant: selectedRestaurant,
      menuItems: draftItems,
      visitDate,
      visitVisibility,
      step: 1,
    });

    onNext();
  };

  const handleCancel = () => {
    editVisitDraftService.clearDraft();
    onCancel();
  };

  // Show loading state
  const isLoading = visitLoading || restaurantLoading || foodItemsLoading || menuItemsLoading || !isReady;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading visit...</p>
        </div>
      </div>
    );
  }

  if (!visit || !selectedRestaurant) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 font-semibold">Visit not found</p>
          <Button onClick={handleCancel} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-xl font-bold text-gray-900">Edit Visit</h1>
        <p className="text-sm text-gray-600 mt-1">{selectedRestaurant.name}</p>
      </div>

      {/* AddItemsToVisit Component */}
      <div className="flex-1 overflow-hidden">
        <AddItemsToVisit
          restaurantId={selectedRestaurant.id}
          restaurantName={selectedRestaurant.name}
          initialSelectedItems={initialMenuItems}
          onComplete={handleComplete}
          onCancel={handleCancel}
          hideHeader={true}
          hideScanMenu={true}
        />
      </div>
    </div>
  );
}

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import { visitDraftService } from '@/services/visitDraftService';
import AddItemsToVisit from '@/components/visits/add/AddItemsToVisit';
import { useEffect } from 'react';

export const Route = createFileRoute('/add-visit/add-items')({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }

    // Check if restaurant was selected
    if (!visitDraftService.hasRestaurant()) {
      throw redirect({ to: '/add-visit/select-restaurant' });
    }
  },
  component: AddItems,
});

function AddItems() {
  const navigate = useNavigate();
  const draft = visitDraftService.getDraft();

  useEffect(() => {
    // Redirect if no restaurant
    if (!draft.restaurant) {
      navigate({ to: '/add-visit/select-restaurant' });
    }
  }, [draft.restaurant, navigate]);

  if (!draft.restaurant) {
    return null;
  }

  const handleItemsSelected = (items: any[]) => {
    // Map to plain MenuItem objects for storage
    const menuItems = items.map(item => ({
      id: item.id,
      name: item.name,
      description: item.userDescription || item.description || '',
      restaurant: item.restaurant,
      created: item.created,
      updated: item.updated,
    }));

    visitDraftService.saveItems(menuItems);
    navigate({ to: '/add-visit/rate-items' });
  };

  const handleCancel = () => {
    // Go back to restaurant selection
    navigate({ to: '/add-visit/select-restaurant' });
  };

  return (
    <AddItemsToVisit
      restaurantId={draft.restaurant.id}
      restaurantName={draft.restaurant.name}
      onComplete={handleItemsSelected}
      onCancel={handleCancel}
    />
  );
}

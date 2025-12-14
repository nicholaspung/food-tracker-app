import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import { visitDraftService } from '@/services/visitDraftService';
import SelectRestaurantPage from '@/components/visits/add/SelectRestaurantPage';

export const Route = createFileRoute('/add-visit/select-restaurant')({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: SelectRestaurant,
});

function SelectRestaurant() {
  const navigate = useNavigate();

  const handleRestaurantSelected = () => {
    // Navigate to add items step
    navigate({ to: '/add-visit/add-items' });
  };

  const handleNavigateToCreateRestaurant = () => {
    // Navigate to create restaurant page
    navigate({ to: '/add-visit/create-restaurant' });
  };

  const handleCancel = () => {
    // Clear the draft when user cancels
    visitDraftService.clearDraft();
    navigate({ to: '/add-visit' });
  };

  return (
    <SelectRestaurantPage
      onRestaurantSelected={handleRestaurantSelected}
      onNavigateToCreateRestaurant={handleNavigateToCreateRestaurant}
      onCancel={handleCancel}
    />
  );
}

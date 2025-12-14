import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import CreateRestaurantPage from '@/components/visits/add/CreateRestaurantPage';

export const Route = createFileRoute('/add-visit/create-restaurant')({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: CreateRestaurant,
});

function CreateRestaurant() {
  const navigate = useNavigate();

  const handleRestaurantCreated = () => {
    // Navigate to add items step after restaurant is created
    navigate({ to: '/add-visit/add-items' });
  };

  const handleBack = () => {
    // Go back to restaurant selection
    navigate({ to: '/add-visit/select-restaurant' });
  };

  return (
    <CreateRestaurantPage
      onRestaurantCreated={handleRestaurantCreated}
      onBack={handleBack}
    />
  );
}

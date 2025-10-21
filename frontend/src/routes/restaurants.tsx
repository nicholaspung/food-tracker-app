import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import RestaurantsPage from '@/components/RestaurantsPage';

export const Route = createFileRoute('/restaurants')({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: Restaurants,
});

function Restaurants() {
  const navigate = useNavigate();

  return (
    <RestaurantsPage
      onNavigateToRestaurant={(id: string) => navigate({ to: `/restaurants/${id}` })}
    />
  );
}

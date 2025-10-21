import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import RestaurantDetailPage from '@/components/RestaurantDetailPage';

export const Route = createFileRoute('/restaurants/$restaurantId')({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: RestaurantDetail,
});

function RestaurantDetail() {
  const { restaurantId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <RestaurantDetailPage
      restaurantId={restaurantId}
      onNavigateBack={() => navigate({ to: '/restaurants' })}
    />
  );
}

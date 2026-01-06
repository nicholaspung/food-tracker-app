import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import AddRestaurantToListPage from '@/components/lists/AddRestaurantToListPage';

export const Route = createFileRoute('/lists/$listId/add-restaurant')({
  beforeLoad: () => {
    // If user is not authenticated, redirect to login
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: AddRestaurantToList,
});

function AddRestaurantToList() {
  const { listId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <AddRestaurantToListPage
      listId={listId}
      onNavigateBack={() => navigate({ to: '/lists/$listId', params: { listId } })}
      onSuccess={() => navigate({ to: '/lists/$listId', params: { listId } })}
    />
  );
}

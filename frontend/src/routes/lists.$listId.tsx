import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import ListDetailPage from '@/components/lists/ListDetailPage';

export const Route = createFileRoute('/lists/$listId')({
  beforeLoad: () => {
    // If user is not authenticated, redirect to login
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: ListDetail,
});

function ListDetail() {
  const { listId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <ListDetailPage
      listId={listId}
      onNavigateBack={() => navigate({ to: '/lists' })}
      onEditList={() => navigate({ to: '/lists/$listId/edit', params: { listId } })}
      onAddRestaurant={() => navigate({ to: '/lists/$listId/add-restaurant', params: { listId } })}
    />
  );
}

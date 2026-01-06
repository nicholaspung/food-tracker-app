import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import EditListPage from '@/components/lists/EditListPage';

export const Route = createFileRoute('/lists/$listId/edit')({
  beforeLoad: () => {
    // If user is not authenticated, redirect to login
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: EditList,
});

function EditList() {
  const { listId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <EditListPage
      listId={listId}
      onNavigateBack={() => navigate({ to: '/lists/$listId', params: { listId } })}
      onSuccess={() => navigate({ to: '/lists/$listId', params: { listId } })}
    />
  );
}

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import CreateListPage from '@/components/lists/CreateListPage';

export const Route = createFileRoute('/lists/new')({
  beforeLoad: () => {
    // If user is not authenticated, redirect to login
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: CreateList,
});

function CreateList() {
  const navigate = useNavigate();

  return (
    <CreateListPage
      onNavigateBack={() => navigate({ to: '/lists' })}
      onSuccess={(listId: string) => navigate({ to: '/lists/$listId', params: { listId } })}
    />
  );
}

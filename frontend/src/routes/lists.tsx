import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import ListsPage from '@/components/lists/ListsPage';

export const Route = createFileRoute('/lists')({
  beforeLoad: () => {
    // If user is not authenticated, redirect to login
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: Lists,
});

function Lists() {
  const navigate = useNavigate();

  return (
    <ListsPage
      onNavigateBack={() => navigate({ to: '/misc' })}
      onSelectList={(listId: string) => navigate({ to: '/lists/$listId', params: { listId } })}
      onCreateList={() => navigate({ to: '/lists/new' })}
    />
  );
}

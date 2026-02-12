import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import TastingSessionsListView from '@/components/tasting-sessions/TastingSessionsListView';

export const Route = createFileRoute('/tasting-sessions')({
  beforeLoad: () => {
    // If user is not authenticated, redirect to login
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }

    // If user is not an admin, redirect to home (beta feature)
    if (!pb.authStore.record?.isAdmin) {
      throw redirect({ to: '/home' });
    }
  },
  component: TastingSessions,
});

function TastingSessions() {
  const navigate = useNavigate();

  return (
    <TastingSessionsListView onNavigateBack={() => navigate({ to: '/misc' })} />
  );
}

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import TastingSessionDetailView from '@/components/tasting-sessions/TastingSessionDetailView';

export const Route = createFileRoute('/tasting-session/$sessionId')({
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
  component: TastingSessionDetail,
});

function TastingSessionDetail() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <TastingSessionDetailView
      sessionId={sessionId}
      onNavigateBack={() => navigate({ to: '/tasting-sessions' })}
    />
  );
}

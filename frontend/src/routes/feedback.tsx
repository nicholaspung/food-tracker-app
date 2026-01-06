import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import FeedbackPage from '@/components/settings/FeedbackPage';

export const Route = createFileRoute('/feedback')({
  beforeLoad: () => {
    // If user is not authenticated, redirect to login
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: Feedback,
});

function Feedback() {
  const navigate = useNavigate();

  return (
    <FeedbackPage
      onNavigateBack={() => {
        navigate({ to: '/profile' });
      }}
    />
  );
}

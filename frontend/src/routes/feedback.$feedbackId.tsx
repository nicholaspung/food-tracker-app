import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import FeedbackDetailPage from '@/components/FeedbackDetailPage';

export const Route = createFileRoute('/feedback/$feedbackId')({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: FeedbackDetail,
});

function FeedbackDetail() {
  const { feedbackId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <FeedbackDetailPage
      feedbackId={feedbackId}
      onNavigateBack={() => navigate({ to: '/feedback' })}
    />
  );
}

import { createFileRoute, redirect } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import FeedbackPage from '@/components/FeedbackPage';

export const Route = createFileRoute('/feedback')({
  beforeLoad: () => {
    // If user is not authenticated, redirect to login
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: FeedbackPage,
});

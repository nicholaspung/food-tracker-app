import { createFileRoute, Navigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import FriendsPage from '@/components/profile/FriendsPage';

export const Route = createFileRoute('/friends')({
  component: Friends,
  beforeLoad: () => {
    // Check if user is authenticated
    if (!pb.authStore.isValid) {
      throw new Error('Not authenticated');
    }
  },
  errorComponent: () => <Navigate to="/" />,
});

function Friends() {
  return <FriendsPage />;
}

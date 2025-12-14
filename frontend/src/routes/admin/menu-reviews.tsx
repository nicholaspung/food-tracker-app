import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import AdminMenuReviewsPage from '@/components/settings/AdminMenuReviewsPage';

export const Route = createFileRoute('/admin/menu-reviews')({
  beforeLoad: () => {
    // If user is not authenticated, redirect to login
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }

    // If user is not an admin, redirect to home
    if (!pb.authStore.record?.isAdmin) {
      throw redirect({ to: '/home' });
    }
  },
  component: AdminMenuReviews,
});

function AdminMenuReviews() {
  const navigate = useNavigate();

  return (
    <AdminMenuReviewsPage
      onNavigateBack={() => {
        navigate({ to: '/profile' });
      }}
    />
  );
}

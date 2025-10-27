import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import ProfilePage from '@/components/ProfilePage';

export const Route = createFileRoute('/profile')({
  beforeLoad: () => {
    // If user is not authenticated, redirect to login
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: Profile,
});

function Profile() {
  const navigate = useNavigate();

  return (
    <ProfilePage
      onNavigateBack={() => {
        navigate({ to: '/home' });
      }}
      onDeleteSuccess={() => {
        navigate({ to: '/' });
      }}
      onLogout={() => {
        navigate({ to: '/' });
      }}
      onNavigateToWhatsNew={() => {
        navigate({ to: '/whats-new' });
      }}
      onNavigateToSettings={() => {
        navigate({ to: '/settings' });
      }}
    />
  );
}

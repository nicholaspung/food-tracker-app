import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import BetaPage from '@/components/settings/BetaPage';

export const Route = createFileRoute('/beta')({
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
  component: Beta,
});

function Beta() {
  const navigate = useNavigate();

  return (
    <BetaPage
      onNavigateBack={() => {
        navigate({ to: '/home' });
      }}
    />
  );
}

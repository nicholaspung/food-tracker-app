import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import SettingsPage from '@/components/settings/SettingsPage';

export const Route = createFileRoute('/settings')({
  beforeLoad: () => {
    // If user is not authenticated, redirect to login
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: Settings,
});

function Settings() {
  const navigate = useNavigate();

  return (
    <SettingsPage
      onNavigateBack={() => {
        navigate({ to: '/profile' });
      }}
    />
  );
}

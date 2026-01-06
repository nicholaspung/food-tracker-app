import { createFileRoute, redirect } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import MiscPage from '@/components/settings/MiscPage';

export const Route = createFileRoute('/misc')({
  beforeLoad: () => {
    // If user is not authenticated, redirect to login
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: MiscPage,
});

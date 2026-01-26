import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import BillsListView from '@/components/bills/BillsListView';

export const Route = createFileRoute('/bills')({
  beforeLoad: () => {
    // If user is not authenticated, redirect to login
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: Bills,
});

function Bills() {
  const navigate = useNavigate();

  return (
    <BillsListView onNavigateBack={() => navigate({ to: '/misc' })} />
  );
}

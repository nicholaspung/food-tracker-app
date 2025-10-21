import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import AddVisitPage from '@/components/AddVisitPage';

export const Route = createFileRoute('/add-visit')({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: AddVisit,
});

function AddVisit() {
  const navigate = useNavigate();

  return (
    <AddVisitPage
      onVisitSaved={() => navigate({ to: '/home' })}
    />
  );
}

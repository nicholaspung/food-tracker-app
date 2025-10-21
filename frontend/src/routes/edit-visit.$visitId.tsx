import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import EditVisitPage from '@/components/EditVisitPage';

export const Route = createFileRoute('/edit-visit/$visitId')({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: EditVisit,
});

function EditVisit() {
  const { visitId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <EditVisitPage
      visitId={visitId}
      onNavigateBack={() => navigate({ to: '/home' })}
    />
  );
}

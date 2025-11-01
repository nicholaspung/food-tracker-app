import { createFileRoute, redirect, useNavigate, useParams } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import { editVisitDraftService } from '@/services/editVisitDraftService';
import EditItemsPage from '@/components/EditItemsPage';

export const Route = createFileRoute('/edit-visit/$visitId/edit-items')({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: EditItems,
});

function EditItems() {
  const navigate = useNavigate();
  const { visitId } = useParams({ from: '/edit-visit/$visitId/edit-items' });

  const handleNext = () => {
    // Navigate to rate items step
    navigate({ to: '/edit-visit/$visitId/rate-items', params: { visitId } });
  };

  const handleCancel = () => {
    // Clear the draft when user cancels
    editVisitDraftService.clearDraft();
    navigate({ to: '/home' });
  };

  return (
    <EditItemsPage
      visitId={visitId}
      onNext={handleNext}
      onCancel={handleCancel}
    />
  );
}

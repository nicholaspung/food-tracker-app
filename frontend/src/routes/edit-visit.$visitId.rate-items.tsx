import { createFileRoute, redirect, useNavigate, useParams } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import { editVisitDraftService } from '@/services/editVisitDraftService';
import EditRateItemsPage from '@/components/EditRateItemsPage';
import { useEffect } from 'react';

export const Route = createFileRoute('/edit-visit/$visitId/rate-items')({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: EditRateItems,
});

function EditRateItems() {
  const navigate = useNavigate();
  const { visitId } = useParams({ from: '/edit-visit/$visitId/rate-items' });
  const draft = editVisitDraftService.getDraft(visitId);

  // Only redirect on initial mount if no draft, don't keep checking during updates
  useEffect(() => {
    // Redirect if no draft or no items on initial load
    if (!draft || !draft.restaurant || draft.menuItems.filter(i => !i._deleted).length === 0) {
      navigate({ to: '/edit-visit/$visitId/edit-items', params: { visitId } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  if (!draft || !draft.restaurant || draft.menuItems.filter(i => !i._deleted).length === 0) {
    return null;
  }

  const handleComplete = () => {
    // Navigate to home after successful submission
    navigate({ to: '/home' });
  };

  const handleBack = () => {
    // Go back to edit items step
    navigate({ to: '/edit-visit/$visitId/edit-items', params: { visitId } });
  };

  return (
    <EditRateItemsPage
      visitId={visitId}
      onBack={handleBack}
      onComplete={handleComplete}
    />
  );
}

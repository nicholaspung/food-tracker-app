import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import { visitDraftService } from '@/services/visitDraftService';
import RateItemsPage from '@/components/visits/add/RateItemsPage';
import { useEffect } from 'react';

export const Route = createFileRoute('/add-visit/rate-items')({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }

    // Check if restaurant and items were selected
    if (!visitDraftService.hasRestaurant()) {
      throw redirect({ to: '/add-visit/select-restaurant' });
    }

    if (!visitDraftService.hasItems()) {
      throw redirect({ to: '/add-visit/add-items' });
    }
  },
  component: RateItems,
});

function RateItems() {
  const navigate = useNavigate();
  const draft = visitDraftService.getDraft();

  useEffect(() => {
    // Redirect if prerequisites not met
    if (!draft.restaurant) {
      navigate({ to: '/add-visit/select-restaurant' });
    } else if (draft.items.length === 0) {
      navigate({ to: '/add-visit/add-items' });
    }
  }, [draft, navigate]);

  if (!draft.restaurant || draft.items.length === 0) {
    return null;
  }

  const handleSubmit = () => {
    // Navigate to home after successful submission
    // The RateItemsPage will handle clearing the draft
    navigate({ to: '/home' });
  };

  const handleBack = () => {
    // Go back to add items step
    navigate({ to: '/add-visit/add-items' });
  };

  return (
    <RateItemsPage
      onSubmit={handleSubmit}
      onBack={handleBack}
    />
  );
}

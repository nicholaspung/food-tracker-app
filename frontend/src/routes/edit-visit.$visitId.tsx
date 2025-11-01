import { createFileRoute, redirect, Outlet, useNavigate, useLocation, useParams } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import { editVisitDraftService } from '@/services/editVisitDraftService';
import { useEffect, useRef } from 'react';

export const Route = createFileRoute('/edit-visit/$visitId')({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: EditVisitLayout,
});

function EditVisitLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { visitId } = useParams({ from: '/edit-visit/$visitId' });
  const previousPathRef = useRef<string>(location.pathname);

  useEffect(() => {
    // If we're at the base /edit-visit/:id path, redirect to first step
    if (window.location.pathname === `/edit-visit/${visitId}`) {
      navigate({ to: '/edit-visit/$visitId/edit-items', params: { visitId } });
    }
  }, [navigate, visitId]);

  useEffect(() => {
    // Track when user navigates away from edit-visit routes
    const currentPath = location.pathname;
    const isEditVisitRoute = currentPath.startsWith(`/edit-visit/${visitId}`);
    const wasEditVisitRoute = previousPathRef.current.startsWith(`/edit-visit/${visitId}`);

    // If we were in edit-visit routes and now we're not, clear the draft
    if (wasEditVisitRoute && !isEditVisitRoute) {
      editVisitDraftService.clearDraft();
    }

    previousPathRef.current = currentPath;
  }, [location.pathname, visitId]);

  return <Outlet />;
}

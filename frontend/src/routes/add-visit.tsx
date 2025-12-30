import { createFileRoute, redirect, Outlet, useLocation } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import { visitDraftService } from '@/services/visitDraftService';
import { useVisitDraftPhotoStore } from '@/stores/visitDraftPhotoStore';
import { useEffect, useRef } from 'react';
import AddVisitOptionSelector from '@/components/visits/add/AddVisitOptionSelector';

export const Route = createFileRoute('/add-visit')({
  beforeLoad: () => {
    // Authentication guard
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: AddVisitLayout,
});

function AddVisitLayout() {
  const location = useLocation();
  const previousPathRef = useRef<string>(location.pathname);
  const isBasePath = location.pathname === '/add-visit';
  const clearAllPhotos = useVisitDraftPhotoStore((state) => state.clearAllPhotos);

  useEffect(() => {
    // Track when user navigates away from add-visit routes
    const currentPath = location.pathname;
    const isAddVisitRoute = currentPath.startsWith('/add-visit');
    const wasAddVisitRoute = previousPathRef.current.startsWith('/add-visit');

    // If we were in add-visit routes and now we're not, clear the draft and photos
    if (wasAddVisitRoute && !isAddVisitRoute) {
      visitDraftService.clearDraft();
      clearAllPhotos();
    }

    previousPathRef.current = currentPath;
  }, [location.pathname, clearAllPhotos]);

  // Show option selector at base path, otherwise show nested routes
  return isBasePath ? <AddVisitOptionSelector /> : <Outlet />;
}

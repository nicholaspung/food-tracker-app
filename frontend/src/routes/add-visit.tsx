import { createFileRoute, redirect, Outlet, useNavigate, useLocation } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import { visitDraftService } from '@/services/visitDraftService';
import { useEffect, useRef } from 'react';

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
  const navigate = useNavigate();
  const location = useLocation();
  const previousPathRef = useRef<string>(location.pathname);

  useEffect(() => {
    // If we're at the base /add-visit path, redirect to first step
    if (window.location.pathname === '/add-visit') {
      navigate({ to: '/add-visit/select-restaurant' });
    }
  }, [navigate]);

  useEffect(() => {
    // Track when user navigates away from add-visit routes
    const currentPath = location.pathname;
    const isAddVisitRoute = currentPath.startsWith('/add-visit');
    const wasAddVisitRoute = previousPathRef.current.startsWith('/add-visit');

    // If we were in add-visit routes and now we're not, clear the draft
    if (wasAddVisitRoute && !isAddVisitRoute) {
      visitDraftService.clearDraft();
    }

    previousPathRef.current = currentPath;
  }, [location.pathname]);

  return <Outlet />;
}

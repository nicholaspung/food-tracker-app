import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MobileLayout } from '@/components/MobileLayout';

// Create a query client instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

// Routes that should show the bottom tab navigation
const ROUTES_WITH_TABS = ['/home', '/profile', '/whats-new'];

function RootComponent() {
  const router = useRouterState();
  const currentPath = router.location.pathname;
  const showTabs = ROUTES_WITH_TABS.includes(currentPath);

  return (
    <QueryClientProvider client={queryClient}>
      <MobileLayout showTabs={showTabs}>
        <Outlet />
      </MobileLayout>
    </QueryClientProvider>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});

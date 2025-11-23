import {
  createRootRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { BottomTabNavigation } from "@/components/BottomTabNavigation";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { SyncProvider } from "@/contexts/SyncContext";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";

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
const ROUTES_WITH_TABS = [
  "/home",
  "/profile",
  "/whats-new",
  "/photos",
  "/add-visit",
  "/quick-track",
  "/edit-visit",
  "/friends",
  "/feedback",
  "/settings",
  "/beta",
  "/admin",
];

function RootComponent() {
  const router = useRouterState();
  const mainRef = useRef<HTMLElement>(null);
  const currentPath = router.location.pathname;

  // Check if current path or any parent path should show tabs
  const showTabs = ROUTES_WITH_TABS.some((route) =>
    currentPath.startsWith(route)
  );

  // Scroll to top when route changes
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [currentPath]);

  return (
    <QueryClientProvider client={queryClient}>
      <SyncProvider>
        <div className="h-screen bg-white flex flex-col overflow-hidden">
          {/* Sync status indicator */}
          <SyncStatusIndicator />

          {/* Scrollable content area */}
          <main
            ref={mainRef}
            className={`flex-1 overflow-y-auto ${showTabs ? "pb-[64px]" : ""}`}
          >
            <Outlet />
          </main>

          {/* Persistent bottom tabs */}
          {showTabs && <BottomTabNavigation />}
          <TanStackRouterDevtools />
        </div>
      </SyncProvider>
    </QueryClientProvider>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});

import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';

import { AdminShell } from '@/components/layout/AdminShell';
import { LoginPage } from '@/features/auth/LoginPage';
import { RequireAdminRoute } from '@/features/auth/RequireAdminRoute';

const AccessControlsPage = lazy(() =>
  import('@/features/users/AccessControlsPage').then(({ AccessControlsPage }) => ({
    default: AccessControlsPage,
  })),
);
const AiImageDebugPage = lazy(() =>
  import('@/features/ai-image-debug/AiImageDebugPage').then(({ AiImageDebugPage }) => ({
    default: AiImageDebugPage,
  })),
);
const AuditTrailPage = lazy(() =>
  import('@/features/audit/AuditTrailPage').then(({ AuditTrailPage }) => ({
    default: AuditTrailPage,
  })),
);
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then(({ DashboardPage }) => ({
    default: DashboardPage,
  })),
);
const FeedbackDetailPage = lazy(() =>
  import('@/features/feedback/FeedbackDetailPage').then(({ FeedbackDetailPage }) => ({
    default: FeedbackDetailPage,
  })),
);
const FeedbackInboxPage = lazy(() =>
  import('@/features/feedback/FeedbackInboxPage').then(({ FeedbackInboxPage }) => ({
    default: FeedbackInboxPage,
  })),
);
const MenuInventoryPage = lazy(() =>
  import('@/features/menu-inventory/MenuInventoryPage').then(({ MenuInventoryPage }) => ({
    default: MenuInventoryPage,
  })),
);
const MenuImageInventoryDetailPage = lazy(() =>
  import('@/features/menu-inventory/MenuImageInventoryDetailPage').then(
    ({ MenuImageInventoryDetailPage }) => ({
      default: MenuImageInventoryDetailPage,
    }),
  ),
);
const MenuReviewDetailPage = lazy(() =>
  import('@/features/menu-reviews/MenuReviewDetailPage').then(({ MenuReviewDetailPage }) => ({
    default: MenuReviewDetailPage,
  })),
);
const MenuReviewsPage = lazy(() =>
  import('@/features/menu-reviews/MenuReviewsPage').then(({ MenuReviewsPage }) => ({
    default: MenuReviewsPage,
  })),
);
const ModerationPage = lazy(() =>
  import('@/features/moderation/ModerationPage').then(({ ModerationPage }) => ({
    default: ModerationPage,
  })),
);
const RecordTypeCountsPage = lazy(() =>
  import('@/features/records/RecordTypeCountsPage').then(({ RecordTypeCountsPage }) => ({
    default: RecordTypeCountsPage,
  })),
);
const RestaurantInventoryDetailPage = lazy(() =>
  import('@/features/menu-inventory/RestaurantInventoryDetailPage').then(
    ({ RestaurantInventoryDetailPage }) => ({
      default: RestaurantInventoryDetailPage,
    }),
  ),
);
const UserDetailPage = lazy(() =>
  import('@/features/users/UserDetailPage').then(({ UserDetailPage }) => ({
    default: UserDetailPage,
  })),
);
const UsersPage = lazy(() =>
  import('@/features/users/UsersPage').then(({ UsersPage }) => ({
    default: UsersPage,
  })),
);
const WaitlistPage = lazy(() =>
  import('@/features/waitlist/WaitlistPage').then(({ WaitlistPage }) => ({
    default: WaitlistPage,
  })),
);

function RouteLoadingPage() {
  return (
    <div className="page-shell">
      <div className="state-panel">
        <p className="eyebrow">Loading</p>
        <h1>Loading admin page...</h1>
      </div>
    </div>
  );
}

function withRouteSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteLoadingPage />}>{element}</Suspense>;
}

const shellRoutes = {
  element: <RequireAdminRoute />,
  children: [
    {
      element: <AdminShell />,
      children: [
        {
          index: true,
          element: <Navigate replace to="/dashboard" />,
        },
        {
          path: '/dashboard',
          element: withRouteSuspense(<DashboardPage />),
        },
        {
          path: '/menu-reviews',
          element: withRouteSuspense(<MenuReviewsPage />),
        },
        {
          path: '/menu-inventory',
          element: withRouteSuspense(<MenuInventoryPage />),
        },
        {
          path: '/menu-inventory/restaurants/:restaurantId',
          element: withRouteSuspense(<RestaurantInventoryDetailPage />),
        },
        {
          path: '/menu-inventory/menu-images/:imageId',
          element: withRouteSuspense(<MenuImageInventoryDetailPage />),
        },
        {
          path: '/ai-image-debug',
          element: withRouteSuspense(<AiImageDebugPage />),
        },
        {
          path: '/menu-reviews/:requestId',
          element: withRouteSuspense(<MenuReviewDetailPage />),
        },
        {
          path: '/feedback',
          element: withRouteSuspense(<FeedbackInboxPage />),
        },
        {
          path: '/feedback/:threadId',
          element: withRouteSuspense(<FeedbackDetailPage />),
        },
        {
          path: '/access-controls',
          element: withRouteSuspense(<AccessControlsPage />),
        },
        {
          path: '/waitlist',
          element: withRouteSuspense(<WaitlistPage />),
        },
        {
          path: '/moderation',
          element: withRouteSuspense(<ModerationPage />),
        },
        {
          path: '/users',
          element: withRouteSuspense(<UsersPage />),
        },
        {
          path: '/record-counts',
          element: withRouteSuspense(<RecordTypeCountsPage />),
        },
        {
          path: '/users/:userId',
          element: withRouteSuspense(<UserDetailPage />),
        },
        {
          path: '/audit-trail',
          element: withRouteSuspense(<AuditTrailPage />),
        },
      ],
    },
  ],
};

function NotFoundPage() {
  return (
    <div className="page-shell">
      <div className="state-panel">
        <p className="eyebrow">Missing route</p>
        <h1>That admin page does not exist.</h1>
        <p className="text-muted">
          Use the navigation to return to a valid moderation view.
        </p>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  shellRoutes,
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);

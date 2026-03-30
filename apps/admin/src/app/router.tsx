import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom';

import { AdminShell } from '@/components/layout/AdminShell';
import { AuditTrailPage } from '@/features/audit/AuditTrailPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { Design1Bloomberg } from '@/features/design-previews/Design1Bloomberg';
import { Design2Linear } from '@/features/design-previews/Design2Linear';
import { Design3Grafana } from '@/features/design-previews/Design3Grafana';
import { Design4Apple } from '@/features/design-previews/Design4Apple';
import { FeedbackDetailPage } from '@/features/feedback/FeedbackDetailPage';
import { FeedbackInboxPage } from '@/features/feedback/FeedbackInboxPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { MenuReviewDetailPage } from '@/features/menu-reviews/MenuReviewDetailPage';
import { MenuReviewsPage } from '@/features/menu-reviews/MenuReviewsPage';
import { ModerationPage } from '@/features/moderation/ModerationPage';
import { RecordTypeCountsPage } from '@/features/records/RecordTypeCountsPage';
import { RequireAdminRoute } from '@/features/auth/RequireAdminRoute';
import { AccessControlsPage } from '@/features/users/AccessControlsPage';
import { UserDetailPage } from '@/features/users/UserDetailPage';
import { UsersPage } from '@/features/users/UsersPage';

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
          element: <DashboardPage />,
        },
        {
          path: '/menu-reviews',
          element: <MenuReviewsPage />,
        },
        {
          path: '/menu-reviews/:requestId',
          element: <MenuReviewDetailPage />,
        },
        {
          path: '/feedback',
          element: <FeedbackInboxPage />,
        },
        {
          path: '/feedback/:threadId',
          element: <FeedbackDetailPage />,
        },
        {
          path: '/access-controls',
          element: <AccessControlsPage />,
        },
        {
          path: '/moderation',
          element: <ModerationPage />,
        },
        {
          path: '/users',
          element: <UsersPage />,
        },
        {
          path: '/record-counts',
          element: <RecordTypeCountsPage />,
        },
        {
          path: '/users/:userId',
          element: <UserDetailPage />,
        },
        {
          path: '/audit-trail',
          element: <AuditTrailPage />,
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
  // Design previews — no auth required
  { path: '/1', element: <Design1Bloomberg /> },
  { path: '/2', element: <Design2Linear /> },
  { path: '/3', element: <Design3Grafana /> },
  { path: '/4', element: <Design4Apple /> },
  shellRoutes,
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);

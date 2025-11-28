import { Link, useRouterState } from '@tanstack/react-router';
import { Home, User, Plus, Users, MessageSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { pb, Feedback } from '@/lib/pocketbase';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';

export function BottomTabNavigation() {
  const router = useRouterState();
  const currentPath = router.location.pathname;
  const currentUser = pb.authStore.record;
  const isKeyboardVisible = useKeyboardVisible();

  // Query for pending received friend requests
  const { data: pendingRequestsCount = 0 } = useQuery({
    queryKey: ['pendingFriendRequestsCount'],
    queryFn: async () => {
      if (!currentUser?.id) return 0;

      const friendships = await pb.collection('friendships').getFullList({
        filter: `friend = "${currentUser.id}" && status = "pending"`,
      });

      return friendships.length;
    },
    enabled: !!currentUser?.id,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Query for unread feedback count (admins see all unread, users see their own)
  const { data: feedbackUnreadCount = 0 } = useQuery({
    queryKey: ['feedbackUnreadCount'],
    queryFn: async () => {
      if (!currentUser?.id) return 0;

      const isAdmin = currentUser.isAdmin === true;
      const feedbackList = await pb.collection('feedback').getFullList<Feedback>();

      return feedbackList.reduce((count, feedback) => {
        const unreadCount = isAdmin
          ? feedback.admin_unread_count || 0
          : feedback.user_unread_count || 0;
        return count + (unreadCount > 0 ? 1 : 0);
      }, 0);
    },
    enabled: !!currentUser?.id,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const tabs = [
    {
      name: 'Home',
      path: '/home',
      icon: Home,
      testId: 'tab-home',
    },
    {
      name: 'Add',
      path: '/add-visit',
      icon: Plus,
      testId: 'tab-add',
    },
    {
      name: 'Friends',
      path: '/friends',
      icon: Users,
      testId: 'tab-friends',
    },
    {
      name: 'Feedback',
      path: '/feedback',
      icon: MessageSquare,
      testId: 'tab-feedback',
    },
    {
      name: 'Profile',
      path: '/profile',
      icon: User,
      testId: 'tab-profile',
    },
  ];

  // Hide navigation when keyboard is visible
  if (isKeyboardVisible) {
    return null;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 shadow-lg"
      data-testid="bottom-tab-navigation"
    >
      <div className="flex justify-around items-center h-16 px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          // Keep "Add" tab highlighted when on /process-photos route
          const isActive = currentPath === tab.path ||
            currentPath.startsWith(tab.path + '/') ||
            (tab.path === '/add-visit' && currentPath === '/process-photos');

          const showBadge =
            (tab.path === '/friends' && pendingRequestsCount > 0) ||
            (tab.path === '/feedback' && feedbackUnreadCount > 0);

          return (
            <Link
              key={tab.path}
              to={tab.path}
              className="flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors relative"
              data-testid={tab.testId}
            >
              <div className="relative">
                <Icon
                  className={`w-6 h-6 ${
                    isActive
                      ? 'text-blue-600'
                      : 'text-gray-400'
                  }`}
                />
                {showBadge && (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {tab.path === '/friends'
                      ? (pendingRequestsCount > 9 ? '9+' : pendingRequestsCount)
                      : (feedbackUnreadCount > 9 ? '9+' : feedbackUnreadCount)}
                  </div>
                )}
              </div>
              <span
                className={`text-xs font-medium ${
                  isActive
                    ? 'text-blue-600'
                    : 'text-gray-500'
                }`}
              >
                {tab.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

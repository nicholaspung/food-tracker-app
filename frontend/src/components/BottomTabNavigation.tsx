import { Link, useRouterState } from '@tanstack/react-router';
import { Home, User, Utensils } from 'lucide-react';

export function BottomTabNavigation() {
  const router = useRouterState();
  const currentPath = router.location.pathname;

  const tabs = [
    {
      name: 'Home',
      path: '/home',
      icon: Home,
      testId: 'tab-home',
    },
    {
      name: 'Restaurants',
      path: '/restaurants',
      icon: Utensils,
      testId: 'tab-restaurants',
    },
    {
      name: 'Profile',
      path: '/profile',
      icon: User,
      testId: 'tab-profile',
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[428px] bg-white border-t border-gray-200 shadow-lg"
      data-testid="bottom-tab-navigation"
    >
      <div className="flex justify-around items-center h-16 px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentPath === tab.path || currentPath.startsWith(tab.path + '/');

          return (
            <Link
              key={tab.path}
              to={tab.path}
              className="flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors"
              data-testid={tab.testId}
            >
              <Icon
                className={`w-6 h-6 ${
                  isActive
                    ? 'text-blue-600'
                    : 'text-gray-400'
                }`}
              />
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

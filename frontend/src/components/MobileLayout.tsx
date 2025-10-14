import { ReactNode, useEffect, useRef } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { BottomTabNavigation } from './BottomTabNavigation';

interface MobileLayoutProps {
  children: ReactNode;
  showTabs?: boolean;
}

export function MobileLayout({ children, showTabs = true }: MobileLayoutProps) {
  const router = useRouterState();
  const mainRef = useRef<HTMLElement>(null);
  const currentPath = router.location.pathname;

  // Scroll to top when route changes
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [currentPath]);

  return (
    <div className="h-screen bg-gray-100 flex justify-center overflow-hidden">
      {/* Mobile container with fixed max-width and side borders on larger screens */}
      <div className="w-full max-w-[428px] relative flex flex-col h-screen bg-white border-x-0 sm:border-x sm:border-gray-300 sm:shadow-lg">
        {/* Scrollable content area */}
        <main
          ref={mainRef}
          className={`flex-1 overflow-y-auto ${showTabs ? 'pb-20' : ''}`}
        >
          {children}
        </main>

        {/* Persistent bottom tabs */}
        {showTabs && <BottomTabNavigation />}
      </div>
    </div>
  );
}

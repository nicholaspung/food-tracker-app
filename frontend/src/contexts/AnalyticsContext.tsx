/**
 * Analytics Context - Manages analytics lifecycle
 *
 * Responsibilities:
 * - Initialize PostHog on mount
 * - Track user authentication state changes
 * - Provide analytics status to components
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { analytics } from '@/lib/analytics';
import { pb } from '@/lib/pocketbase';
import { ANALYTICS_EVENTS } from '@/types/posthog';

interface AnalyticsContextValue {
  isEnabled: boolean;
  track: typeof analytics.track;
  trackPageView: typeof analytics.trackPageView;
}

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

interface AnalyticsProviderProps {
  children: React.ReactNode;
}

export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  // Track initialization state to trigger re-renders
  const [initialized, setInitialized] = useState(false);

  // Initialize PostHog on mount
  useEffect(() => {
    analytics.init();
    // Check if initialization completed
    setInitialized(analytics.isEnabled());
  }, []);

  // Track authentication state changes
  useEffect(() => {
    // Check if user is already authenticated on mount
    if (pb.authStore.isValid && pb.authStore.model) {
      const user = pb.authStore.model;
      analytics.identifyUser(user.id, {
        isAdmin: user.isAdmin || false,
        isSubscriber: user.isSubscriber || false,
      });
    }

    // Listen for auth changes
    const unsubscribe = pb.authStore.onChange((token, model) => {
      if (token && model) {
        // User logged in
        analytics.identifyUser(model.id, {
          isAdmin: model.isAdmin || false,
          isSubscriber: model.isSubscriber || false,
        });

        analytics.track(ANALYTICS_EVENTS.LOGIN_SUCCESS, {
          source: 'AnalyticsContext',
        });
      } else {
        // User logged out
        analytics.track(ANALYTICS_EVENTS.LOGOUT, {
          source: 'AnalyticsContext',
        });

        analytics.resetUser();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Create stable function references
  const track = useMemo(() => analytics.track.bind(analytics), []);
  const trackPageView = useMemo(() => analytics.trackPageView.bind(analytics), []);

  // Recompute value when initialization state changes
  const value: AnalyticsContextValue = useMemo(() => ({
    isEnabled: initialized,
    track,
    trackPageView,
  }), [initialized, track, trackPageView]);

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}

/**
 * Hook to access analytics context
 */
export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
}

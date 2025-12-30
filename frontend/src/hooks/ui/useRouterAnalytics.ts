/**
 * useRouterAnalytics - Track page views on route changes
 *
 * Integrates with TanStack Router to automatically track pageviews
 */

import { useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { logger } from '@/lib/logger';

export function useRouterAnalytics() {
  const location = useLocation();
  const { trackPageView, isEnabled } = useAnalytics();

  useEffect(() => {
    if (!isEnabled) return;

    // Track page view on route change
    const path = location.pathname;
    logger.log('[Analytics] Route changed:', path);

    trackPageView(path, {
      search: location.search,
    });
  }, [location.pathname, location.search, trackPageView, isEnabled]);
}

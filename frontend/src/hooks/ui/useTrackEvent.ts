/**
 * useTrackEvent - Custom hook for type-safe event tracking
 *
 * Usage:
 * const trackEvent = useTrackEvent();
 * trackEvent(ANALYTICS_EVENTS.VISIT_CREATION_COMPLETED, {
 *   itemCount: 3,
 *   hasPhotos: true,
 * });
 */

import { useCallback } from 'react';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { logger } from '@/lib/logger';
import type { AnalyticsEvent } from '@/types/posthog';

export function useTrackEvent() {
  const { track, isEnabled } = useAnalytics();

  return useCallback(
    <T extends Record<string, any>>(
      eventName: AnalyticsEvent | string,
      properties?: T
    ) => {
      if (!isEnabled) {
        logger.log('[Analytics] Tracking disabled, event not sent:', eventName);
        return;
      }

      track(eventName, properties);
    },
    [track, isEnabled]
  );
}

/**
 * Hook to track component mount/unmount
 */
export function useTrackPageView(pageName: string, properties?: Record<string, any>) {
  const { trackPageView, isEnabled } = useAnalytics();

  return useCallback(() => {
    if (!isEnabled) return;

    trackPageView(pageName, properties);
  }, [pageName, properties, trackPageView, isEnabled]);
}

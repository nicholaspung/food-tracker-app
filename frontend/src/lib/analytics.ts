/**
 * PostHog Analytics Service
 *
 * Centralized analytics initialization and configuration.
 * Handles:
 * - PostHog initialization with privacy-safe defaults
 * - User identification (anonymous IDs only)
 * - Event tracking with type safety
 * - Offline queue management
 * - Reverse proxy to bypass ad blockers
 *
 * Note: Analytics requests are proxied through our backend at /api/analytics
 * This improves privacy and bypasses most ad blockers.
 */

import posthog from 'posthog-js';
import { logger } from '@/lib/logger';
import type { UserProperties } from '@/types/posthog';

// Environment configuration
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8090';
const DISABLE_ANALYTICS = import.meta.env.VITE_DISABLE_ANALYTICS === 'true';
const IS_DEV = import.meta.env.DEV;

// Use reverse proxy through our backend
// Uses /api/visit-insights to blend in with visit tracking (not detected by ad blockers)
// This bypasses ad blockers and improves privacy
const POSTHOG_API_HOST = `${API_URL}/api/visit-insights`;

// Analytics enabled only if key exists and not explicitly disabled
const ANALYTICS_ENABLED = !DISABLE_ANALYTICS && !!POSTHOG_KEY;

class AnalyticsService {
  private initialized = false;
  private currentUserId: string | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize PostHog with privacy-safe configuration
   */
  init(): void {
    if (!ANALYTICS_ENABLED) {
      logger.log('[Analytics] PostHog disabled (no API key or explicitly disabled)');
      return;
    }

    // Prevent double initialization (React Strict Mode in dev runs effects twice)
    // Check both our flag and PostHog's internal state
    if (this.initialized || this.initPromise || (posthog as any).__loaded) {
      return;
    }

    // Mark as initializing to prevent race conditions
    this.initPromise = Promise.resolve();

    try {
      posthog.init(POSTHOG_KEY, {
        // Reverse proxy configuration
        // Uses /api/visit-insights endpoint to blend with app's visit tracking
        api_host: POSTHOG_API_HOST,
        ui_host: POSTHOG_API_HOST, // Use same host for UI assets (though we have feature flags disabled)

        // Cross-origin configuration for reverse proxy
        xhr_headers: {
          // Add any custom headers if needed
        },

        // Privacy settings - CRITICAL
        person_profiles: 'identified_only', // Only create profiles for identified users
        opt_out_capturing_by_default: false,
        autocapture: false, // Disable auto-capture (manual tracking only)
        capture_pageview: false, // We'll manually track pageviews via router
        capture_pageleave: false,
        disable_session_recording: true, // CRITICAL: No session recordings
        disable_surveys: true,

        // Performance & offline support
        loaded: (posthog) => {
          logger.log('[Analytics] PostHog loaded successfully (via /api/visit-insights proxy)');

          // Enable offline queue (uses localStorage)
          posthog.set_config({
            persistence: 'localStorage',
            persistence_name: 'food_tracker_analytics',
          });
        },

        // Development mode
        debug: IS_DEV,

        // Advanced privacy
        mask_all_text: true,
        mask_all_element_attributes: true,

        // Use before_send instead of deprecated sanitize_properties
        before_send: (event) => {
          // Strip any accidentally included PII from event properties
          if (event?.properties) {
            const piiFields = ['email', 'name', 'phone', 'address', 'ip'];
            piiFields.forEach(field => {
              if (event.properties && field in event.properties) {
                delete event.properties[field];
                logger.warn(`[Analytics] Removed PII field: ${field}`);
              }
            });
          }
          return event;
        },

        // Handle proxy errors gracefully
        on_request_error: (failedRequest) => {
          logger.warn('[Analytics] Request failed:', failedRequest);
        },

        // Disable feature flags and remote config (not used in this app)
        advanced_disable_flags: true,
        advanced_disable_feature_flags: true,
        advanced_disable_feature_flags_on_first_load: true,
        disable_external_dependency_loading: true,
      });

      this.initialized = true;
      logger.log('[Analytics] PostHog initialized');
    } catch (error) {
      logger.error('[Analytics] Failed to initialize PostHog:', error);
      logger.warn('[Analytics] This may be due to an ad blocker. Analytics will be disabled.');
      // Don't throw - gracefully degrade if PostHog fails to load
      this.initialized = false;
    }
  }

  /**
   * Identify user (use anonymous PocketBase ID, no PII)
   */
  identifyUser(userId: string, properties?: UserProperties): void {
    if (!ANALYTICS_ENABLED || !this.initialized) return;

    try {
      this.currentUserId = userId;

      // CRITICAL: Only pass non-PII properties
      const safeProperties: UserProperties = {
        isAdmin: properties?.isAdmin || false,
        isSubscriber: properties?.isSubscriber || false,
      };

      posthog.identify(userId, safeProperties);
      logger.log('[Analytics] User identified:', userId, safeProperties);
    } catch (error) {
      logger.error('[Analytics] Failed to identify user:', error);
    }
  }

  /**
   * Reset user identity on logout
   */
  resetUser(): void {
    if (!ANALYTICS_ENABLED || !this.initialized) return;

    try {
      posthog.reset();
      this.currentUserId = null;
      logger.log('[Analytics] User identity reset');
    } catch (error) {
      logger.error('[Analytics] Failed to reset user:', error);
    }
  }

  /**
   * Track custom event
   */
  track<T extends Record<string, any>>(
    eventName: string,
    properties?: T
  ): void {
    if (!ANALYTICS_ENABLED || !this.initialized) return;

    try {
      // Ensure no PII in properties
      const sanitizedProperties = this.sanitizeProperties(properties);

      posthog.capture(eventName, sanitizedProperties);
      logger.log('[Analytics] Event tracked:', eventName, sanitizedProperties);
    } catch (error) {
      logger.error('[Analytics] Failed to track event:', error);
    }
  }

  /**
   * Track page view
   */
  trackPageView(path: string, properties?: Record<string, any>): void {
    if (!ANALYTICS_ENABLED || !this.initialized) return;

    try {
      posthog.capture('$pageview', {
        $current_url: path,
        ...properties,
      });
      logger.log('[Analytics] Page view tracked:', path);
    } catch (error) {
      logger.error('[Analytics] Failed to track page view:', error);
    }
  }

  /**
   * Update user properties
   */
  setUserProperties(properties: UserProperties): void {
    if (!ANALYTICS_ENABLED || !this.initialized) return;

    try {
      posthog.people.set(properties);
      logger.log('[Analytics] User properties updated:', properties);
    } catch (error) {
      logger.error('[Analytics] Failed to update user properties:', error);
    }
  }

  /**
   * Sanitize properties to remove any PII
   */
  private sanitizeProperties<T extends Record<string, any>>(
    properties?: T
  ): T | undefined {
    if (!properties) return undefined;

    const sanitized = { ...properties };
    const piiFields = ['email', 'name', 'phone', 'address', 'ip', 'password'];

    piiFields.forEach(field => {
      if (field in sanitized) {
        delete sanitized[field];
        logger.warn(`[Analytics] Removed PII field from event: ${field}`);
      }
    });

    return sanitized;
  }

  /**
   * Check if analytics is enabled
   */
  isEnabled(): boolean {
    return ANALYTICS_ENABLED && this.initialized;
  }

  /**
   * Get current user ID
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }
}

// Export singleton instance
export const analytics = new AnalyticsService();

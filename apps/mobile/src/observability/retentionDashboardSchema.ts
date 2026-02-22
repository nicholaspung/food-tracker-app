export type DashboardChartType = 'trend' | 'funnel' | 'retention' | 'table';
export type DashboardAggregation = 'unique_users' | 'total_events';
export type FilterOperator = 'equals' | 'not_equals' | 'in';

export interface DashboardEventFilter {
  property: string;
  operator: FilterOperator;
  value: string | number | boolean | null | (string | number | boolean | null)[];
}

export interface DashboardEventSelector {
  eventName: string;
  filters?: DashboardEventFilter[];
}

export interface DashboardActionSpec {
  id: string;
  title: string;
  description: string;
  selectors: DashboardEventSelector[];
}

export interface DashboardFunnelStep {
  title: string;
  selectors: DashboardEventSelector[];
}

export interface DashboardCardSpec {
  id: string;
  title: string;
  objective: 'acquisition' | 'activation' | 'retention' | 'adoption' | 'friction';
  chart: DashboardChartType;
  aggregation: DashboardAggregation;
  interval: 'day' | 'week' | 'month';
  selectors?: DashboardEventSelector[];
  funnelSteps?: DashboardFunnelStep[];
  breakdownBy?: string;
  formula?: string;
  notes?: string[];
}

export interface DashboardSectionSpec {
  id: string;
  title: string;
  cards: DashboardCardSpec[];
}

export interface RetentionDashboardSchema {
  version: string;
  timezone: string;
  globalFilters: DashboardEventFilter[];
  actions: DashboardActionSpec[];
  sections: DashboardSectionSpec[];
}

const mobilePlatformFilter: DashboardEventFilter = {
  property: 'platform',
  operator: 'in',
  value: ['ios', 'android'],
};

export const MOBILE_RETENTION_DASHBOARD_SCHEMA: RetentionDashboardSchema = {
  version: '2026-02-22',
  timezone: 'Local project timezone',
  globalFilters: [mobilePlatformFilter],
  actions: [
    {
      id: 'A_CORE_CONTENT_CREATED',
      title: 'Core Content Created',
      description: 'Any user-authored core content action (visit, quick track, photo flow, note, list, bill).',
      selectors: [
        { eventName: 'Visit Creation Completed' },
        { eventName: 'Photo Processing Completed' },
        {
          eventName: 'FEATURE_MUTATION_SUCCEEDED',
          filters: [{ property: 'action', operator: 'equals', value: 'quick_track.create' }],
        },
        {
          eventName: 'FEATURE_MUTATION_SUCCEEDED',
          filters: [{ property: 'action', operator: 'equals', value: 'note.create' }],
        },
        {
          eventName: 'FEATURE_MUTATION_SUCCEEDED',
          filters: [{ property: 'action', operator: 'equals', value: 'restaurant_list.create' }],
        },
        {
          eventName: 'FEATURE_MUTATION_SUCCEEDED',
          filters: [{ property: 'action', operator: 'equals', value: 'bill.create' }],
        },
      ],
    },
    {
      id: 'A_ACTIVE_USAGE',
      title: 'Active Usage',
      description: 'Engaged app usage signal for WAU/retention cohorts.',
      selectors: [
        { eventName: 'SCREEN_VIEW' },
        { eventName: 'TAB_PRESSED' },
        { eventName: 'Visit Creation Completed' },
        { eventName: 'Photo Processing Completed' },
        {
          eventName: 'FEATURE_MUTATION_SUCCEEDED',
          filters: [
            {
              property: 'action',
              operator: 'in',
              value: [
                'quick_track.create',
                'note.create',
                'restaurant_list.create',
                'bill.create',
                'friend.invite',
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'A_RETENTION_FRICTION',
      title: 'Retention Friction',
      description: 'Signals likely to reduce activation or retention.',
      selectors: [
        { eventName: 'USAGE_LIMIT_REACHED' },
        { eventName: 'ERROR_TOAST_SHOWN' },
        { eventName: 'AUTH_SESSION_RESTORE_FAILED' },
      ],
    },
  ],
  sections: [
    {
      id: 'acquisition-overview',
      title: 'Acquisition Overview',
      cards: [
        {
          id: 'daily-signups',
          title: 'Daily Signups',
          objective: 'acquisition',
          chart: 'trend',
          aggregation: 'unique_users',
          interval: 'day',
          selectors: [{ eventName: 'AUTH_SIGNUP_SUBMIT_SUCCEEDED' }],
        },
        {
          id: 'daily-logins',
          title: 'Daily Successful Logins',
          objective: 'acquisition',
          chart: 'trend',
          aggregation: 'unique_users',
          interval: 'day',
          selectors: [{ eventName: 'LOGIN_SUCCESS' }],
        },
        {
          id: 'session-starts',
          title: 'Daily Session Starts',
          objective: 'acquisition',
          chart: 'trend',
          aggregation: 'unique_users',
          interval: 'day',
          selectors: [{ eventName: 'SESSION_STARTED' }],
          breakdownBy: 'userTier',
        },
      ],
    },
    {
      id: 'activation-funnel',
      title: 'Activation Funnel',
      cards: [
        {
          id: 'signup-to-first-content',
          title: 'Signup to First Content (7d Conversion)',
          objective: 'activation',
          chart: 'funnel',
          aggregation: 'unique_users',
          interval: 'week',
          funnelSteps: [
            {
              title: 'Signup Complete',
              selectors: [{ eventName: 'AUTH_SIGNUP_SUBMIT_SUCCEEDED' }],
            },
            {
              title: 'Opened Add Flow',
              selectors: [
                {
                  eventName: 'SCREEN_VIEW',
                  filters: [{ property: 'screenName', operator: 'equals', value: 'AddVisit' }],
                },
              ],
            },
            {
              title: 'Created Core Content',
              selectors: [
                { eventName: 'Visit Creation Completed' },
                { eventName: 'Photo Processing Completed' },
                {
                  eventName: 'FEATURE_MUTATION_SUCCEEDED',
                  filters: [{ property: 'action', operator: 'equals', value: 'quick_track.create' }],
                },
                {
                  eventName: 'FEATURE_MUTATION_SUCCEEDED',
                  filters: [{ property: 'action', operator: 'equals', value: 'note.create' }],
                },
              ],
            },
          ],
          notes: ['In PostHog, define step 3 as an Action using A_CORE_CONTENT_CREATED for OR semantics.'],
        },
      ],
    },
    {
      id: 'retention-health',
      title: 'Retention Health',
      cards: [
        {
          id: 'weekly-retention-active-usage',
          title: 'Weekly Retention (Active Usage)',
          objective: 'retention',
          chart: 'retention',
          aggregation: 'unique_users',
          interval: 'week',
          selectors: [{ eventName: 'SCREEN_VIEW' }],
          notes: ['Use A_ACTIVE_USAGE Action as both start and returning event in PostHog retention.'],
        },
        {
          id: 'wau',
          title: 'Weekly Active Users (WAU)',
          objective: 'retention',
          chart: 'trend',
          aggregation: 'unique_users',
          interval: 'week',
          selectors: [{ eventName: 'SCREEN_VIEW' }],
        },
        {
          id: 'mau',
          title: 'Monthly Active Users (MAU)',
          objective: 'retention',
          chart: 'trend',
          aggregation: 'unique_users',
          interval: 'month',
          selectors: [{ eventName: 'SCREEN_VIEW' }],
        },
        {
          id: 'stickiness',
          title: 'WAU/MAU Stickiness',
          objective: 'retention',
          chart: 'table',
          aggregation: 'unique_users',
          interval: 'week',
          formula: 'WAU / MAU',
          notes: ['Build as a formula insight in PostHog using the WAU and MAU cards.'],
        },
      ],
    },
    {
      id: 'feature-adoption',
      title: 'Feature Adoption',
      cards: [
        {
          id: 'core-creation-mix',
          title: 'Core Creation Mix',
          objective: 'adoption',
          chart: 'trend',
          aggregation: 'total_events',
          interval: 'week',
          selectors: [
            { eventName: 'Visit Creation Completed' },
            { eventName: 'Photo Processing Completed' },
            {
              eventName: 'FEATURE_MUTATION_SUCCEEDED',
              filters: [{ property: 'action', operator: 'equals', value: 'quick_track.create' }],
            },
            {
              eventName: 'FEATURE_MUTATION_SUCCEEDED',
              filters: [{ property: 'action', operator: 'equals', value: 'note.create' }],
            },
            {
              eventName: 'FEATURE_MUTATION_SUCCEEDED',
              filters: [{ property: 'action', operator: 'equals', value: 'restaurant_list.create' }],
            },
            {
              eventName: 'FEATURE_MUTATION_SUCCEEDED',
              filters: [{ property: 'action', operator: 'equals', value: 'bill.create' }],
            },
          ],
        },
        {
          id: 'screen-adoption',
          title: 'Screen Adoption (Unique Users)',
          objective: 'adoption',
          chart: 'trend',
          aggregation: 'unique_users',
          interval: 'week',
          selectors: [{ eventName: 'SCREEN_VIEW' }],
          breakdownBy: 'screenName',
        },
      ],
    },
    {
      id: 'friction-and-risk',
      title: 'Friction and Risk',
      cards: [
        {
          id: 'usage-limit-pressure',
          title: 'Usage Limit Pressure',
          objective: 'friction',
          chart: 'trend',
          aggregation: 'unique_users',
          interval: 'week',
          selectors: [{ eventName: 'USAGE_LIMIT_REACHED' }],
          breakdownBy: 'metric',
        },
        {
          id: 'error-toast-reach',
          title: 'Error Toast Reach',
          objective: 'friction',
          chart: 'trend',
          aggregation: 'unique_users',
          interval: 'week',
          selectors: [{ eventName: 'ERROR_TOAST_SHOWN' }],
          breakdownBy: 'toastSource',
        },
        {
          id: 'auth-restore-failures',
          title: 'Auth Restore Failures',
          objective: 'friction',
          chart: 'trend',
          aggregation: 'total_events',
          interval: 'week',
          selectors: [{ eventName: 'AUTH_SESSION_RESTORE_FAILED' }],
        },
        {
          id: 'offline-enqueue-pressure',
          title: 'Offline Queue Pressure',
          objective: 'friction',
          chart: 'trend',
          aggregation: 'total_events',
          interval: 'week',
          selectors: [{ eventName: 'MUTATION_ENQUEUED' }],
          notes: ['Use breakdown by action/type to locate workflows frequently blocked by connectivity.'],
        },
      ],
    },
  ],
};

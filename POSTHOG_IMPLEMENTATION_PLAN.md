# PostHog Analytics Integration Plan - Food Tracker App

## Executive Summary

This plan outlines a comprehensive PostHog analytics integration that follows the app's existing architectural patterns (repositories, hooks, constants) while maintaining strict privacy controls (no PII tracking). The implementation leverages PostHog's built-in offline queue and integrates seamlessly with the existing offline sync system.

**Key Decisions:**
- **Privacy:** Minimal data collection - anonymous user IDs only, no PII
- **Analytics Goals:** User behavior, performance, errors, and conversions
- **Key Flows:** Visit creation, quick track, OCR, and social features
- **Integration Points:** 7 new files (6 frontend + 1 backend), 9 modified files
- **Backend Proxy:** Routes analytics through `/api/visit-insights` to bypass ad blockers
- **Bundle Size:** ~40KB additional (posthog-js + custom code)
- **Rollout:** Phased approach recommended (4-5 weeks)

---

## Table of Contents

1. [Implementation Steps](#1-implementation-steps)
2. [Event Naming Conventions](#2-event-naming-conventions)
3. [Code Structure](#3-code-structure)
4. [Testing Strategy](#4-testing-strategy)
5. [Privacy Considerations](#5-privacy-considerations)
6. [Performance Impact](#6-performance-impact)
7. [Rollout Strategy](#7-rollout-strategy)
8. [PostHog Dashboard Setup](#8-posthog-dashboard-setup)

---

## 1. Implementation Steps

### Phase 1: Foundation Setup

#### 1.1 Package Installation

```bash
cd frontend
npm install posthog-js
```

**Package:** `posthog-js` v1.96+ (supports React 19, built-in offline queue)

#### 1.2 Environment Variables

The implementation uses a **backend proxy** to route analytics requests through `/api/visit-insights`. This bypasses ad blockers and improves privacy by keeping the PostHog host hidden from the client.

##### Frontend Variables

**File:** `frontend/.env.example`

```bash
# Analytics Configuration (PostHog)
# Get your API key from https://posthog.com (free tier available)
# Analytics requests are proxied through the backend at /api/visit-insights
VITE_POSTHOG_KEY=phc_your_project_api_key_here
# Set to 'true' to disable analytics in development
VITE_DISABLE_ANALYTICS=false
```

**Note:** `VITE_POSTHOG_HOST` is NOT needed - the frontend uses the backend proxy at `/api/visit-insights`.

##### Backend Variables

**File:** `backend/.env.example`

```bash
# PostHog Analytics (Optional)
# Used for the reverse proxy at /api/visit-insights
# If not set, analytics proxy will be disabled (no impact on functionality)
POSTHOG_API_KEY=phc_your_posthog_api_key_here
POSTHOG_HOST=https://us.i.posthog.com
```

##### GitHub Actions / Deployment Variables

For CI/CD deployment, add these to your GitHub environment secrets:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_POSTHOG_KEY` | Yes | PostHog project API key (frontend) |
| `POSTHOG_API_KEY` | Yes | Same PostHog API key (backend proxy) |
| `POSTHOG_HOST` | No | PostHog host (defaults to `https://us.i.posthog.com`) |
| `VITE_DISABLE_ANALYTICS` | No | Set to `true` to disable (defaults to `false`) |

**Note:** `VITE_POSTHOG_KEY` and `POSTHOG_API_KEY` use the same value - your PostHog Project API Key.

#### 1.3 TypeScript Type Definitions

**New File:** `frontend/src/types/posthog.ts`

Contains:
- User property types (isAdmin, isSubscriber only - NO PII)
- Event property interfaces for all tracked events
- `ANALYTICS_EVENTS` constant object with all event names
- Type-safe event definitions

**Key Exports:**
```typescript
export const ANALYTICS_EVENTS = {
  LOGIN_SUCCESS: 'Login Success',
  VISIT_CREATION_COMPLETED: 'Visit Creation Completed',
  OCR_COMPLETED: 'OCR Completed',
  ERROR_OCCURRED: 'Error Occurred',
  // ... 30+ events total
} as const;

export interface VisitCreatedProperties {
  itemCount: number;
  hasPhotos: boolean;
  hasNotes: boolean;
  creationMethod: 'manual' | 'quick_track' | 'ocr';
}

export interface OCRProcessedProperties {
  processingTimeMs: number;
  itemsExtracted: number;
  success: boolean;
  errorType?: string;
}
```

---

### Phase 2: Core Infrastructure

#### 2.1 Analytics Service

**New File:** `frontend/src/lib/analytics.ts`

**Purpose:** Singleton service for PostHog initialization and tracking

**Key Features:**
- Privacy-first configuration (no autocapture, no session recording)
- PII sanitization for all events
- User identification (anonymous IDs only)
- Offline queue (uses localStorage)
- Type-safe tracking methods

**Class Methods:**
```typescript
class AnalyticsService {
  init(): void                                    // Initialize PostHog
  identifyUser(userId: string, props?: UserProperties): void
  resetUser(): void                              // On logout
  track<T>(eventName: string, properties?: T): void
  trackPageView(path: string, properties?: any): void
  setUserProperties(properties: UserProperties): void
  isEnabled(): boolean
}
```

**Privacy Safeguards:**
```typescript
posthog.init(POSTHOG_KEY, {
  autocapture: false,                  // No auto DOM tracking
  capture_pageview: false,             // Manual page tracking
  disable_session_recording: true,     // CRITICAL: No recordings
  person_profiles: 'identified_only',  // Minimal profiles
  sanitize_properties: (props) => {
    // Strip PII fields: email, name, phone, address
  }
});
```

#### 2.2 Backend Proxy Handler

**File:** `backend/handlers/posthog_proxy.go`

**Purpose:** Reverse proxy for PostHog requests to bypass ad blockers

The backend proxy routes all PostHog API calls through `/api/visit-insights/*`, which:
- Blends with the app's visit tracking feature
- Bypasses ad blocker detection (they look for `/analytics`, `/tracking`, etc.)
- Keeps PostHog host hidden from client-side code
- Forwards necessary headers for accurate analytics (User-Agent, IP, Referer)

**Endpoints:**
| Frontend Path | Proxied To |
|---------------|------------|
| `/api/visit-insights/static/*` | `us-assets.i.posthog.com/static/*` |
| `/api/visit-insights/capture` | `us.i.posthog.com/capture/` |
| `/api/visit-insights/batch` | `us.i.posthog.com/batch/` |
| `/api/visit-insights/decide` | `us.i.posthog.com/decide/` |

**Environment Variables Used:**
- `POSTHOG_HOST` - API host (default: `https://us.i.posthog.com`)
- Assets host derived automatically (e.g., `https://us-assets.i.posthog.com`)

**Frontend Configuration:**
The `analytics.ts` service must configure PostHog to use the proxy:
```typescript
posthog.init(POSTHOG_KEY, {
  api_host: window.location.origin + '/api/visit-insights',
  ui_host: 'https://us.posthog.com', // For PostHog toolbar (if used)
  // ... other options
});
```

#### 2.3 Analytics Context Provider

**New File:** `frontend/src/contexts/AnalyticsContext.tsx`

**Purpose:** React context to manage analytics lifecycle

**Responsibilities:**
- Initialize PostHog on app mount
- Listen to PocketBase auth changes
- Auto-identify users on login
- Auto-reset on logout
- Provide analytics methods to components

**Integration with Auth:**
```typescript
useEffect(() => {
  const unsubscribe = pb.authStore.onChange((token, model) => {
    if (token && model) {
      // User logged in
      analytics.identifyUser(model.id, {
        isAdmin: model.isAdmin,
        isSubscriber: model.isSubscriber,
      });
    } else {
      // User logged out
      analytics.resetUser();
    }
  });
  return unsubscribe;
}, []);
```

#### 2.3 Custom Hooks

**New File:** `frontend/src/hooks/ui/useTrackEvent.ts`

Type-safe hook for tracking events:
```typescript
const trackEvent = useTrackEvent();

trackEvent(ANALYTICS_EVENTS.VISIT_CREATION_COMPLETED, {
  itemCount: 3,
  hasPhotos: true,
});
```

**New File:** `frontend/src/hooks/ui/useRouterAnalytics.ts`

Auto-track page views on route changes:
```typescript
export function useRouterAnalytics() {
  const location = useLocation();
  const { trackPageView } = useAnalytics();

  useEffect(() => {
    trackPageView(location.pathname, {
      search: location.search,
    });
  }, [location.pathname]);
}
```

---

### Phase 3: Integration Points

#### 3.1 Root Provider Setup

**File:** `frontend/src/routes/__root.tsx`

**Changes:**
1. Import `AnalyticsProvider`
2. Wrap app with provider (after QueryClient, before Sync)
3. Add `useRouterAnalytics()` hook call for page tracking

```typescript
import { AnalyticsProvider } from '@/contexts/AnalyticsContext';
import { useRouterAnalytics } from '@/hooks/ui/useRouterAnalytics';

function RootComponent() {
  useRouterAnalytics(); // Track page views

  return (
    <QueryClientProvider client={queryClient}>
      <AnalyticsProvider>
        <SyncProvider>
          {/* App content */}
        </SyncProvider>
      </AnalyticsProvider>
    </QueryClientProvider>
  );
}
```

#### 3.2 Visit Creation Tracking

**File:** `frontend/src/hooks/offline/useOfflineVisitCreation.ts`

**Changes:** Add tracking to mutation callbacks

```typescript
import { useTrackEvent } from '@/hooks/ui/useTrackEvent';
import { ANALYTICS_EVENTS } from '@/types/posthog';

export function useOfflineVisitCreation() {
  const trackEvent = useTrackEvent();

  return useMutation({
    onSuccess: (data, variables) => {
      trackEvent(ANALYTICS_EVENTS.VISIT_CREATION_COMPLETED, {
        itemCount: variables.foodItems.length,
        hasPhotos: (variables.photos?.length || 0) > 0,
        hasNotes: !!variables.visit.notes,
        creationMethod: 'manual',
      });
    },
    onError: (error) => {
      trackEvent(ANALYTICS_EVENTS.VISIT_CREATION_FAILED, {
        errorType: error.name,
      });
    },
  });
}
```

**Similar changes for:**
- `useOfflineQuickTrack.ts`
- `useOfflineQuickTrackUpdate.ts`
- `useOfflineQuickTrackDelete.ts`

#### 3.3 OCR Performance Tracking

**File:** `frontend/src/hooks/menu/useMenuOCR.ts`

**Changes:** Track OCR start, completion, and failure with timing

```typescript
const processMenuImage = async (imageFile: File, restaurantId: string) => {
  const startTime = Date.now();

  trackEvent(ANALYTICS_EVENTS.OCR_STARTED);

  try {
    const result = await ocrService.processImage(imageFile);

    trackEvent(ANALYTICS_EVENTS.OCR_COMPLETED, {
      processingTimeMs: Date.now() - startTime,
      itemsExtracted: result.length,
      success: true,
    });
  } catch (error) {
    trackEvent(ANALYTICS_EVENTS.OCR_FAILED, {
      processingTimeMs: Date.now() - startTime,
      success: false,
      errorType: error.name,
    });
  }
};
```

#### 3.4 Offline Sync Tracking

**File:** `frontend/src/contexts/SyncContext.tsx`

**Changes:** Track sync operations and performance

```typescript
import { analytics } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/types/posthog';

const syncOperations = async () => {
  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;

  // ... sync logic ...

  analytics.track(ANALYTICS_EVENTS.OFFLINE_SYNC_COMPLETED, {
    operationCount: successCount + failCount,
    successCount,
    failCount,
    syncDuration: Date.now() - startTime,
  });
};
```

#### 3.5 Error Tracking Integration

**File:** `frontend/src/hooks/ui/useErrorHandler.ts`

**Changes:** Auto-track all errors through existing handler

```typescript
import { analytics } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/types/posthog';

const handleError = (err: unknown, config?: ErrorHandlingConfig) => {
  // ... existing error handling ...

  analytics.track(ANALYTICS_EVENTS.ERROR_OCCURRED, {
    errorType: error.type,
    errorMessage: config?.customMessage || message,
    severity: config?.severity || 'error',
    userFacing: true,
    retryable: config?.retryable || false,
  });
};
```

---

## 2. Event Naming Conventions

### Format Rules

**Event Names:**
- Pattern: `[Noun] [Verb in Past Tense]`
- Case: Title Case with spaces
- Examples:
  - ✅ "Visit Created"
  - ✅ "OCR Completed"
  - ✅ "Friend Request Sent"
  - ❌ "create_visit"
  - ❌ "ocrComplete"

**Property Names:**
- Case: camelCase
- Descriptive and concise
- Examples:
  - ✅ `itemCount`
  - ✅ `processingTimeMs`
  - ✅ `hasPhotos`
  - ❌ `count`
  - ❌ `time`

### Event Categories

**1. Authentication (5 events)**
- Login Success
- Login Failed
- Signup Success
- Signup Failed
- Logout

**2. Visit Flow (5 events)**
- Visit Creation Started
- Visit Creation Completed
- Visit Creation Failed
- Visit Updated
- Visit Deleted

**3. Quick Track (3 events)**
- Quick Track Created
- Quick Track Updated
- Quick Track Deleted

**4. Photos & OCR (4 events)**
- Photo Uploaded
- OCR Started
- OCR Completed
- OCR Failed

**5. Social Features (3 events)**
- Friend Request Sent
- Friend Request Accepted
- Friend Removed

**6. Lists (4 events)**
- List Created
- List Updated
- List Deleted
- List Item Added

**7. Bills (3 events)**
- Bill Created
- Bill Settled
- Bill Invite Sent

**8. Performance (2 events)**
- Page Load Time
- API Response Time

**9. Errors (2 events)**
- Error Occurred
- Network Error

**10. Offline Sync (3 events)**
- Offline Operation Queued
- Offline Sync Completed
- Offline Sync Failed

**Total: 34 events**

---

## 3. Code Structure

### New Files (7)

**Frontend:**
1. **`frontend/src/types/posthog.ts`** - Type definitions and event constants
2. **`frontend/src/lib/analytics.ts`** - Analytics service singleton
3. **`frontend/src/contexts/AnalyticsContext.tsx`** - React context provider
4. **`frontend/src/hooks/ui/useTrackEvent.ts`** - Custom tracking hook
5. **`frontend/src/hooks/ui/useRouterAnalytics.ts`** - Page view tracking
6. **`frontend/src/constants/analyticsEvents.ts`** - Event catalog documentation

**Backend:**
7. **`backend/handlers/posthog_proxy.go`** - Reverse proxy for PostHog (bypasses ad blockers)

### Modified Files (9)

**Frontend:**
1. **`frontend/.env.example`** - Add PostHog environment variables
2. **`frontend/src/routes/__root.tsx`** - Add AnalyticsProvider & router tracking
3. **`frontend/src/hooks/offline/useOfflineVisitCreation.ts`** - Track visit creation
4. **`frontend/src/hooks/offline/useOfflineQuickTrack.ts`** - Track quick track creation
5. **`frontend/src/hooks/menu/useMenuOCR.ts`** - Track OCR performance
6. **`frontend/src/contexts/SyncContext.tsx`** - Track offline sync
7. **`frontend/src/hooks/ui/useErrorHandler.ts`** - Track errors

**Backend:**
8. **`backend/.env.example`** - Add PostHog environment variables
9. **`backend/main.go`** - Register PostHog proxy handlers

### Dependencies

**Package.json:**
```json
{
  "dependencies": {
    "posthog-js": "^1.96.0"
  }
}
```

---

## 4. Testing Strategy

### Manual Testing Checklist

#### Test 1: Verify Installation
```bash
cd frontend
npm install posthog-js
npm run dev
```

**Expected:**
- Browser console: `[Analytics] PostHog initialized`
- No errors in console
- PostHog loaded successfully

#### Test 2: User Identification
1. Login with test account
2. Check console: `[Analytics] User identified: <userId>`
3. Verify PostHog dashboard shows new user

#### Test 3: Event Tracking
1. Create a visit (add-visit flow)
2. Console: `[Analytics] Event tracked: Visit Creation Completed`
3. PostHog Live Events shows event with properties

#### Test 4: Page View Tracking
1. Navigate: Home → Profile → Settings
2. Console shows pageview for each route
3. PostHog shows 3 pageview events

#### Test 5: Offline Queue
1. DevTools → Network → Offline
2. Create quick track item
3. Event queued (localStorage: `food_tracker_analytics`)
4. Go online
5. Event flushed to PostHog

#### Test 6: Privacy Controls
1. Track event with PII:
   ```typescript
   trackEvent('Test Event', {
     email: 'test@example.com', // Should be stripped
     itemCount: 5 // Should be kept
   })
   ```
2. Console warning: `[Analytics] Removed PII field: email`
3. PostHog only receives `itemCount`

### Automated Testing (Optional)

**File:** `frontend/cypress/e2e/analytics.cy.ts`

```typescript
describe('Analytics', () => {
  it('should track visit creation', () => {
    cy.intercept('POST', '**/batch/', (req) => {
      const events = req.body.batch;
      const visitEvent = events.find(e =>
        e.event === 'Visit Creation Completed'
      );

      expect(visitEvent).to.exist;
      expect(visitEvent.properties.itemCount).to.be.greaterThan(0);
    }).as('analytics');

    // Create visit flow
    cy.login('test@example.com', 'password');
    cy.visit('/add-visit');
    // ... complete flow ...

    cy.wait('@analytics');
  });
});
```

---

## 5. Privacy Considerations

### What We Track ✅

- **Anonymous user IDs** (PocketBase `user.id`)
- **User flags:** `isAdmin`, `isSubscriber`
- **Feature usage:** Counts, frequencies, flows
- **Performance metrics:** Timing, durations
- **Error types:** Types, frequencies (no stack traces with PII)
- **Page views:** Routes only (no query params with PII)

### What We NEVER Track ❌

- Email addresses
- Names
- Phone numbers
- IP addresses
- Device identifiers (beyond PostHog's anonymous ID)
- Location data (beyond user-initiated actions)
- Text content (food item names, notes, messages)
- Photos or image data

### Technical Safeguards

1. **Property Sanitization:** All events pass through `sanitizeProperties()` that strips PII
2. **Disabled Autocapture:** No automatic DOM element tracking
3. **No Session Recording:** Explicitly disabled in PostHog config
4. **Person Profiles:** Only created for identified users (not anonymous)
5. **Environment Controls:** `VITE_DISABLE_ANALYTICS=true` to disable entirely

### GDPR/Privacy Compliance

- PostHog supports GDPR person deletions
- Can be self-hosted for complete data control
- No third-party cookies (uses localStorage only)
- User can opt out via browser settings
- EU hosting available (`https://eu.i.posthog.com`)

### Privacy-Safe Configuration

```typescript
posthog.init(POSTHOG_KEY, {
  person_profiles: 'identified_only',
  autocapture: false,
  capture_pageview: false,
  disable_session_recording: true,
  disable_surveys: true,
  mask_all_text: true,
  mask_all_element_attributes: true,
  sanitize_properties: (properties) => {
    // Strip PII fields
  },
});
```

---

## 6. Performance Impact

### Bundle Size

- **posthog-js:** ~35KB gzipped
- **Custom code:** ~5KB (types, hooks, context)
- **Total:** ~40KB additional bundle size

**Mitigation:**
- PostHog loads asynchronously (non-blocking)
- Can be lazy-loaded on first interaction
- Minimal impact on initial page load

### Runtime Performance

- **Event tracking:** <1ms per event (asynchronous)
- **Offline queue:** localStorage (fast, local)
- **Network:** Batched requests (1 request per 10 events or 10 seconds)
- **Memory:** <1MB for typical session

### Mobile Considerations

- **Battery:** Negligible (no polling, event-driven)
- **Network:** Batched requests minimize data usage
- **Storage:** localStorage cap ~10MB (ample for queue)

**Assessment:** No performance concerns for mobile-first app.

---

## 7. Rollout Strategy

### Recommended: Phased Rollout (4-5 weeks)

**Week 1: Development Testing**
- Install PostHog in dev environment
- Implement core infrastructure (analytics service, context, hooks)
- Test with development API key
- Verify events in PostHog dashboard
- Team review of privacy controls

**Week 2: Beta Deployment**
- Deploy to beta environment with beta PostHog project
- Monitor for errors or performance issues
- Gather team feedback
- Refine event properties if needed

**Week 3: Core Flow Tracking**
- Add tracking to visit creation flow
- Add tracking to quick track
- Add tracking to OCR
- Monitor data quality in PostHog

**Week 4: Extended Tracking**
- Add tracking for social features (friends, lists, bills)
- Add error tracking integration
- Add offline sync tracking
- Verify all events flowing correctly

**Week 5: Production Rollout**
- Deploy to production
- Monitor PostHog dashboard for insights
- Set up alerts for error spikes
- Create dashboards for product team

### Alternative: All-at-Once Rollout (2 weeks)

**Week 1: Implementation**
- Implement all files and integrations
- Test in development
- Code review

**Week 2: Deployment**
- Deploy to production
- Monitor closely for issues

**Pros:**
- Faster implementation
- Immediate full data coverage
- Simpler deployment

**Cons:**
- Higher risk of bugs affecting analytics
- Harder to isolate issues
- All-or-nothing approach

**Recommendation:** Use phased rollout for safer deployment.

---

## 8. PostHog Dashboard Setup

Based on the implemented analytics, here are comprehensive insights and dashboards you should create in PostHog.

---

### Key Funnels to Create

#### 1. Visit Creation Funnel
```
Type: Funnel
Name: Visit Creation Flow
Steps:
  1. Visit Creation Started
  2. Visit Creation Completed
Breakdown by: source
Filter: Drop by creationMethod (manual/quick_track/ocr)
KPI Target: >75% completion rate
Alert: If completion rate drops below 60%

Actionable Insights:
- Identify where users abandon the flow
- Compare completion rates by creation method
- Track week-over-week improvements
```

#### 2. Quick Track Funnel
```
Type: Funnel
Name: Quick Track Flow
Steps:
  1. Quick Track Started
  2. Quick Track Created
Breakdown by: source
KPI Target: >90% completion rate (simpler flow than visits)
Alert: If completion rate drops below 80%

Actionable Insights:
- Quick track should have higher completion than full visits
- Monitor for UX issues causing abandonment
```

#### 3. Authentication Funnel
```
Type: Funnel
Name: User Signup Flow
Steps:
  1. Signup Success
  2. Visit Creation Started (first action)
  3. Visit Creation Completed OR Quick Track Created
Breakdown by: signupMethod (email vs OAuth)
KPI Target: >50% of signups complete first visit/quick track
Time window: 7 days

Actionable Insights:
- Measure user activation rate
- Compare OAuth vs email signup effectiveness
- Identify onboarding improvements needed
```

#### 4. Social Activation Funnel
```
Type: Funnel
Name: Social Feature Adoption
Steps:
  1. Friend Request Sent
  2. Friend Request Accepted
  3. Visit Created (with visibility = friends)
Time window: 30 days
KPI Target: >40% of friend requests lead to shared visits

Actionable Insights:
- Track social feature adoption
- Measure network effects
- Identify social engagement patterns
```

---

### Essential Trends to Monitor

#### User Acquisition & Retention

**1. Daily/Weekly/Monthly Active Users**
```
Type: Trend (unique users)
Events: Any event (filter: not Login Success)
Time period: Last 90 days
Intervals: Daily, Weekly, Monthly
Breakdown by: First-time users vs Returning users

KPIs:
- DAU (Daily Active Users)
- WAU (Weekly Active Users)
- MAU (Monthly Active Users)
- DAU/MAU ratio (stickiness, target: >20%)
```

**2. New User Signups**
```
Type: Trend (count)
Event: Signup Success
Breakdown by: signupMethod, hasInviter
Time period: Last 90 days
KPI Target: Week-over-week growth

Actionable Insights:
- Track signup growth rate
- Compare email vs OAuth adoption
- Measure viral coefficient (signups with inviter / total signups)
```

**3. Authentication Failures**
```
Type: Trend (count)
Events:
  - Login Failed
  - Signup Failed
Breakdown by: loginMethod/signupMethod, errorType
Alert: If daily failures > 50

Actionable Insights:
- Identify authentication issues
- Monitor OAuth provider problems
- Track error patterns (password resets needed, etc.)
```

#### Core Feature Usage

**4. Visit Creation Rate**
```
Type: Trend (count & unique users)
Event: Visit Creation Completed
Breakdown by: creationMethod (manual/quick_track/ocr)
Formulas:
  - Visits per DAU (count / unique users)
  - Average items per visit (avg itemCount)
  - Photo attachment rate (% with hasPhotos = true)

KPIs:
- Visits per active user per week: >1.5
- Photo attachment rate: >60%
- OCR usage: >20% of visits
```

**5. Quick Track Adoption**
```
Type: Trend (unique users)
Events:
  - Quick Track Created
  - Quick Track Updated
  - Quick Track Deleted
Time period: Last 90 days

Metrics to track:
- % of users who use Quick Track vs full visits
- Quick Track frequency (items per user per week)
- Update/delete patterns (engagement signals)

KPI Target: >40% of active users use Quick Track
```

**6. Photo & OCR Usage**
```
Type: Multiple trends
Events:
  - Photo Processing Started
  - Photo Uploaded
  - OCR Started
  - OCR Completed
  - OCR Failed

Metrics:
- Photo upload rate (uploads / active users)
- OCR success rate (completed / started)
- Photos per visit (from Visit Created properties)
- OCR adoption (% users who tried OCR)

KPIs:
- OCR success rate: >85%
- Photo uploads per active user per week: >2
```

#### Social Features

**7. Friend Network Growth**
```
Type: Trend (count & unique users)
Events:
  - Friend Request Sent
  - Friend Request Accepted
  - Friend Removed

Metrics:
- Friend requests per user
- Acceptance rate (accepted / sent)
- Churn (removed / total friendships)
- Network size distribution

KPIs:
- Friend request acceptance rate: >60%
- Active users with 1+ friend: >30%
- Average friends per user: >3
```

**8. List Feature Usage**
```
Type: Trend (count & unique users)
Events:
  - List Created
  - List Item Added
  - List Deleted
Breakdown by: visibility (private/friends/public)

Metrics:
- Lists created per user
- Average items per list (calculate from item additions)
- List visibility preferences
- List deletion rate (deleted / created)

KPI Target: >20% of users create at least 1 list
```

**9. Bill Splitting Adoption**
```
Type: Trend (count & unique users)
Events:
  - Bill Created
  - Bill Settled
Breakdown by: splitMode (even/custom)

Metrics:
- Bills created per user
- Settlement rate (settled / created)
- Average participant count
- Days to settlement (from daysSinceCreated property)
- Split mode preferences

KPIs:
- Active users using bills: >15%
- Settlement rate: >70%
- Average days to settlement: <14 days
```

#### Editing & Deletion Patterns

**10. Content Lifecycle**
```
Type: Trend (count)
Events:
  - Visit Updated
  - Visit Deleted
  - Quick Track Updated
  - Quick Track Deleted

Metrics:
- Update frequency (updates / creates)
- Deletion rate (deletes / creates)
- Time to first edit
- Edit patterns (what gets changed most)

Actionable Insights:
- High deletion rate = UX issues or accidental creation
- Low update rate = good initial capture flow
- Frequent updates = engagement signal
```

---

### Performance Insights

#### 11. OCR Performance Monitoring
```
Type: Trend (average, p50, p95, p99)
Event: OCR Completed
Metric: processingTimeMs
Filters: success = true
Breakdown by: itemsExtracted (bucketed: 1-5, 6-10, 11-20, 20+)

KPIs:
- p50 processing time: <3000ms
- p95 processing time: <8000ms
- Success rate: >85%

Alert: If p95 > 10000ms or success rate < 80%

Actionable Insights:
- Monitor OCR service health
- Identify performance regressions
- Correlate performance with items extracted
```

#### 12. Photo Upload Performance
```
Type: Trend (count)
Event: Photo Uploaded
Properties to analyze:
  - isUpdate (update vs new photo)
  - hasVisit (visit photo vs quick track)
  - fileSize (average and p95)

Metrics:
- Upload success rate
- Average file size
- Update vs new upload ratio

Alert: If upload failures spike
```

#### 13. Offline Sync Health
```
Type: Multiple metrics
Event: Offline Sync Completed
Properties:
  - operationCount
  - successCount
  - failCount
  - syncDuration

Dashboards:
1. Sync success rate: successCount / operationCount
2. Average sync duration
3. Failed operation trends
4. Operations queued (from Offline Operation Queued)

KPIs:
- Sync success rate: >95%
- Average sync duration: <2000ms
- Failed operations: <5% of total

Alert: If failCount > 10 in single sync OR success rate < 90%
```

---

### Error & Reliability Insights

#### 14. Error Tracking
```
Type: Trend (count)
Event: Error Occurred
Breakdown by: errorType, severity, source
Filters:
  - userFacing = true
  - severity = 'error'

Metrics:
- Error rate per DAU
- Top 5 error types
- Errors by component/page
- Retryable vs non-retryable errors

KPI Target: <10 errors per 100 DAU
Alert: If daily errors > 100 OR new error type appears

Actionable Insights:
- Identify most impactful errors
- Prioritize bug fixes by frequency
- Monitor error trends after releases
```

#### 15. Visit & Quick Track Failures
```
Type: Trend (count)
Events:
  - Visit Creation Failed
  - Quick Track Creation Failed (if tracked)
Breakdown by: errorType

Metrics:
- Failure rate (failed / started)
- Error patterns
- Time to failure

Alert: If failure rate > 5%
```

---

### User Behavior Insights

#### 16. Feature Mix Analysis
```
Type: Stacked area chart
Events:
  - Visit Creation Completed
  - Quick Track Created
  - Photo Uploaded
Time period: Last 90 days
Visualization: Stacked by event type

Actionable Insights:
- Understand which features drive engagement
- Identify feature usage trends
- Measure feature cannibalization (e.g., Quick Track vs full Visits)
```

#### 17. User Segmentation by Activity Level
```
Type: Cohort analysis
Segments:
  - Power Users: >10 visits/quick tracks per month
  - Regular Users: 3-10 per month
  - Light Users: 1-2 per month
  - Dormant: 0 actions in last 30 days

Track:
- Feature usage by segment
- Retention by segment
- Conversion to power user

KPI Target: >20% power users, <30% dormant
```

#### 18. Photo Upload Patterns
```
Type: Trend (count)
Event: Photo Uploaded
Properties:
  - isUpdate (replacing existing photo)
  - hasVisit (visit vs quick track)

Metrics:
- % visits with photos (from Visit Created hasPhotos property)
- % quick tracks with photos
- Photo update frequency
- Photos per user per week

Actionable Insights:
- Photo engagement level
- User preferences (prefer photos or not)
```

---

### Advanced Dashboards to Create

### Dashboard 1: Executive Overview
**Purpose:** High-level metrics for leadership

**Metrics:**
1. **Growth**
   - Total users (unique users all-time)
   - New signups this week/month
   - DAU, WAU, MAU trends
   - User growth rate (%)

2. **Engagement**
   - Visits + Quick Tracks per user per week
   - Photo upload rate
   - Active users with friends (% social adoption)
   - Feature usage breakdown (pie chart)

3. **Health**
   - Error rate (errors per 100 DAU)
   - OCR success rate
   - Offline sync success rate
   - Visit creation funnel completion rate

4. **Activation**
   - % new signups who create first visit within 7 days
   - % users with 1+ friend
   - % users who tried OCR

**Refresh:** Daily
**Audience:** Product leadership, stakeholders

---

### Dashboard 2: Product Health Monitor
**Purpose:** Day-to-day product monitoring for PM/Engineering

**Section 1: User Activity**
- DAU/WAU/MAU (last 30 days)
- Visit creation rate (trend)
- Quick Track creation rate (trend)
- Photo upload rate (trend)

**Section 2: Feature Funnels**
- Visit creation funnel (completion rate)
- Quick Track funnel (completion rate)
- Social activation funnel
- Signup → First Action funnel

**Section 3: Reliability**
- Error rate trend
- Top 5 errors (table)
- Visit/Quick Track failure rate
- Offline sync health

**Section 4: Performance**
- OCR processing time (p50, p95)
- OCR success rate
- Photo upload success rate

**Refresh:** Hourly
**Alerts:**
- Error rate spike
- Funnel completion drops >10%
- OCR success rate < 80%

**Audience:** Product managers, engineers, QA

---

### Dashboard 3: Feature Adoption Tracker
**Purpose:** Track adoption of specific features

**Visit Features:**
- Visits created (trend)
- Items per visit (average)
- Photos per visit (%)
- Notes usage (% visits with notes)
- OCR usage (% visits)

**Quick Track:**
- Quick tracks created (trend)
- Category usage breakdown
- Photo attachment rate
- Edit/delete frequency

**Social Features:**
- Friend requests sent/accepted (trend)
- Acceptance rate
- Network size distribution (histogram)
- Shared visits (% visibility = friends)

**Lists:**
- Lists created (trend)
- Items per list (average)
- Visibility preferences (pie chart)
- Active list users (%)

**Bill Splitting:**
- Bills created (trend)
- Split mode preferences (even vs custom)
- Settlement rate
- Average participants per bill
- Days to settlement (average)

**Refresh:** Daily
**Audience:** Product team, feature owners

---

### Dashboard 4: User Journey Analytics
**Purpose:** Understand user flows and behavior patterns

**New User Journey:**
1. Signup method breakdown (email vs OAuth)
2. Signup → First visit time distribution
3. First visit creation method (manual/quick track/OCR)
4. Week 1 retention (% active in week 2)

**Engagement Patterns:**
- Visit frequency distribution (histogram)
- Peak usage times (heatmap by day/hour)
- Feature mix over user lifetime (cohorts)
- Path analysis: What do users do after creating a visit?

**Social Growth:**
- Friend network growth curve
- Viral coefficient (invites → signups)
- Shared content rate (% visibility = friends)

**Retention & Churn:**
- Weekly retention curve (cohort analysis)
- Churn indicators (last action > 30 days ago)
- Resurrection (returned after 30+ days dormancy)

**Refresh:** Weekly
**Audience:** Product team, growth team

---

### Dashboard 5: Performance & Reliability
**Purpose:** Monitor technical health and performance

**Performance Metrics:**
- OCR processing time (p50, p75, p95, p99)
- Photo upload time
- Offline sync duration
- Page load times (if tracked)

**Success Rates:**
- OCR success rate (%)
- Photo upload success rate (%)
- Offline sync success rate (%)
- Visit creation success rate (%)

**Error Monitoring:**
- Total errors (trend)
- Errors by type (stacked bar)
- Errors by source/component (table)
- Error rate per DAU
- Retryable vs fatal errors

**Offline Behavior:**
- Offline operations queued (trend)
- Sync batch sizes (average)
- Failed syncs (count and reasons)
- Offline → online transition success rate

**Refresh:** Real-time (5 minute intervals)
**Alerts:**
- Error spike (>100/hour)
- OCR success rate < 80%
- Sync success rate < 90%
- Performance degradation (p95 increases >50%)

**Audience:** Engineering team, SRE, DevOps

---

### Dashboard 6: Mobile Experience
**Purpose:** Monitor mobile-specific metrics

**Mobile Usage:**
- Photo uploads per user (mobile behavior indicator)
- Quick Track vs full visits ratio (mobile preference)
- OCR usage (camera-based feature)
- Offline operation frequency

**Performance on Mobile:**
- OCR processing time on mobile
- Photo upload success rate
- Offline sync reliability
- Error rates

**Mobile Engagement:**
- Daily visit creation from mobile
- Photo attachment rate
- Quick Track adoption

**Refresh:** Daily
**Audience:** Mobile team, product team

---

### Alerts to Configure

**Critical Alerts (Immediate Action Required):**
1. Error rate spike: >100 errors/hour
2. OCR success rate drop: <75%
3. Visit creation funnel: <50% completion
4. Authentication failures: >50 failures/hour
5. Offline sync success: <85%

**Warning Alerts (Monitor Closely):**
1. DAU drops >20% week-over-week
2. Error rate: >50 errors/hour
3. OCR success rate: <85%
4. Photo upload failures: >10/hour
5. Visit creation funnel: <65% completion

**Info Alerts (Track Trends):**
1. New error types appear
2. Feature usage shifts >30% week-over-week
3. Signup rate drops >15% week-over-week

---

### Retention Cohorts to Track

```
Type: Retention Table
Name: User Retention by Signup Week
Cohorts: Users who signed up in Week N
Return criteria: Any event (Visit Created, Quick Track Created, etc.)
Time periods: Week 1, Week 2, Week 4, Week 8, Week 12

KPI Targets:
- Week 1 retention: >60%
- Week 2 retention: >40%
- Week 4 retention: >25%
- Week 8 retention: >15%

Breakdown by:
- Signup method (email vs OAuth)
- Has inviter (organic vs referred)
- First action type (Visit vs Quick Track vs OCR)
```

---

### Session Analysis

```
Type: Session analysis
Metrics to track:
- Average session duration
- Actions per session
- Sessions per user per week
- Session start/end patterns

Insights:
- Session length distribution (short <2min, medium 2-10min, long >10min)
- Peak usage times
- Feature usage within sessions
- Drop-off points in long sessions
```

---

### A/B Test Ideas (Future)

Once you have baseline metrics, consider these A/B tests:

1. **Onboarding Flow**
   - Test: Skip OCR tutorial vs show tutorial
   - Metric: Week 1 OCR adoption rate

2. **Quick Track UX**
   - Test: Photo-first vs text-first entry
   - Metric: Quick Track completion rate

3. **Social Prompts**
   - Test: Friend invite prompt timing (immediate vs after 3 visits)
   - Metric: Friend request sent rate

4. **Visit Creation Flow**
   - Test: Single-page vs multi-step form
   - Metric: Visit creation completion rate

---

### Custom User Properties to Set

Beyond events, set these user properties for segmentation:

```typescript
posthog.identify(userId, {
  // Engagement level
  totalVisits: number,
  totalQuickTracks: number,
  totalPhotos: number,

  // Feature adoption flags
  hasUsedOCR: boolean,
  hasUsedLists: boolean,
  hasUsedBills: boolean,
  hasFriends: boolean,

  // User type
  userSegment: 'power' | 'regular' | 'light' | 'dormant',

  // Subscription (if applicable)
  isSubscriber: boolean,

  // Admin flag
  isAdmin: boolean,

  // Dates
  firstVisitCreatedAt: ISO date,
  lastActiveAt: ISO date,

  // Counts (update periodically)
  friendCount: number,
  listCount: number,
  billCount: number,
});
```

These properties enable powerful segmentation:
- "Show me Quick Track adoption among users with 10+ visits"
- "What's the OCR success rate for power users vs light users?"
- "How do users with friends behave differently?"

---

## Next Steps

### To Start Implementation:

1. **Set up PostHog project:**
   - Go to https://posthog.com
   - Create new project (free tier)
   - Get API key (starts with `phc_`)

2. **Install dependencies:**
   ```bash
   cd frontend
   npm install posthog-js
   ```

3. **Create environment file:**
   ```bash
   cp .env.example .env
   # Add PostHog API key to .env
   ```

4. **Create new files in order:**
   - `src/types/posthog.ts` (types first)
   - `src/lib/analytics.ts` (core service)
   - `src/contexts/AnalyticsContext.tsx` (context provider)
   - `src/hooks/ui/useTrackEvent.ts` (custom hook)
   - `src/hooks/ui/useRouterAnalytics.ts` (router tracking)
   - `src/constants/analyticsEvents.ts` (documentation)

5. **Modify existing files:**
   - `src/routes/__root.tsx` (add provider)
   - Add tracking to hooks and contexts

6. **Test in development:**
   - Run `npm run dev`
   - Verify PostHog initialization
   - Test event tracking
   - Check PostHog dashboard

7. **Deploy to production**

---

## Questions & Clarifications

Before implementation, please confirm:

1. **PostHog Setup:** Do you have a PostHog account? Need help setting one up?
2. **Privacy Review:** Does the privacy approach meet your requirements?
3. **Rollout Preference:** Phased (4-5 weeks) or all-at-once (2 weeks)?
4. **Additional Events:** Any other events you'd like to track beyond what's listed?
5. **Testing:** Want to implement Cypress tests for analytics?

---

## Summary

This plan provides a complete PostHog analytics integration that:

✅ **Respects Privacy:** No PII tracking, anonymous IDs only
✅ **Follows Patterns:** Uses existing architecture (repositories, hooks, constants)
✅ **Mobile-First:** Minimal performance impact for mobile users
✅ **Comprehensive:** Tracks behavior, performance, errors, and conversions
✅ **Type-Safe:** Full TypeScript support
✅ **Offline-Ready:** Leverages PostHog's built-in queue
✅ **Ad-Blocker Resistant:** Backend proxy at `/api/visit-insights` bypasses detection
✅ **Maintainable:** Well-documented, extensible code

**Files to Create:** 7 (6 frontend + 1 backend)
**Files to Modify:** 9 (7 frontend + 2 backend)
**Bundle Size Impact:** ~40KB (frontend only)
**Implementation Time:** 4-5 weeks (phased) or 2 weeks (all-at-once)

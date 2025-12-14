# CODEBASE REFACTORING PLAN

## Overview
Based on comprehensive codebase analysis, 78 refactoring opportunities identified across 45+ files. Total estimated effort: 136 hours (~3-4 weeks). This plan prioritizes high-impact, low-risk improvements first.

---

## PHASE 1: CRITICAL PATH - Extract Reusable Components (Est: 16 hours)
**Impact**: Eliminate 200+ lines of duplicated code, establish component patterns
**Risk**: Low

### 1.1 Create Shared Form Components

- [x] **DatePickerField Component** (4 hours)
  - Create `frontend/src/components/ui/DatePickerField.tsx`
  - Extract date picker UI pattern from:
    - `HomePage.tsx:80-128`
    - `QuickTrackPage.tsx:48,168-204`
    - `RateItemsPage.tsx:33,183-219`
    - `ProcessPhotosPage.tsx` (similar pattern)
  - Props: `value`, `onChange`, `maxDate`, `label`
  - Includes: display mode + edit mode with calendar icon

- [x] **VisibilityToggle Component** (3 hours)
  - Create `frontend/src/components/ui/VisibilityToggle.tsx`
  - Extract "Friends can view this" checkbox pattern from:
    - `QuickTrackPage.tsx:206-232`
    - `RateItemsPage.tsx:222-246`
    - `ProcessPhotosPage.tsx` (similar pattern)
  - Props: `value`, `onChange`, `entityType`
  - Includes: checkbox + icon + description text

- [x] **RatingSelector Component** (4 hours)
  - Create `frontend/src/components/RatingSelector.tsx`
  - Extract 5-button rating grid from:
    - `QuickTrackPage.tsx:306-327`
    - `RateItemsPage.tsx:296-318`
  - Props: `value`, `onChange`, `disabled`
  - Use RATING_OPTIONS from constants

- [x] **RatingLegend Component** (2 hours)
  - Create `frontend/src/components/RatingLegend.tsx`
  - Extract collapsible rating guide from:
    - `QuickTrackPage.tsx:266-298`
    - `RateItemsPage.tsx:249-281`
  - Props: `initiallyExpanded`
  - Includes: expand/collapse with ChevronUp/Down icons

- [x] **Update Components to Use New Shared Components** (3 hours)
  - Replace duplicated code in HomePage, QuickTrackPage, RateItemsPage, ProcessPhotosPage
  - Test each updated component
  - Verify styling and behavior matches original

---

## PHASE 2: HIGH-IMPACT - Create Centralized Hooks (Est: 20 hours)
**Impact**: Consistency across 10+ files, easier testing
**Risk**: Low

### 2.1 API Query Hooks

- [x] **useRestaurants Hook** (2 hours)
  - Create `frontend/src/hooks/api/useRestaurants.ts`
  - Centralize restaurant queries used in 8+ files
  - Return: `{ data, isLoading, error, refetch }`

- [x] **useFoodItems Hook** (2 hours)
  - Create `frontend/src/hooks/api/useFoodItems.ts`
  - Centralize food item queries
  - Support optional filtering

- [x] **useVisits Hook** (3 hours)
  - Create `frontend/src/hooks/api/useVisits.ts`
  - Centralize visit queries with expand
  - Support optional user filtering

- [x] **Update All Components to Use New Hooks** (4 hours)
  - Replace inline useQuery calls across codebase
  - Ensure consistent queryKey usage
  - Test data fetching in each component

### 2.2 Photo Management Hook

- [x] **usePhotoManager Hook** (5 hours)
  - Create `frontend/src/hooks/usePhotoManager.ts`
  - Extract photo capture/remove logic from:
    - `RateItemsPage.tsx:127-161`
    - `QuickTrackPage.tsx:67-87`
    - Similar patterns in other components
  - Return: `{ photos, previewUrls, handleCapture, handleRemove, cleanup }`
  - Include automatic URL.revokeObjectURL cleanup

- [x] **Update Photo-Handling Components** (2 hours)
  - Replace duplicated photo logic in RateItemsPage, QuickTrackPage, etc.
  - Test photo upload/preview/remove functionality

### 2.3 Error Handling Hook

- [x] **useErrorHandler Hook** (2 hours)
  - Create `frontend/src/hooks/useErrorHandler.ts`
  - Standardize error handling patterns
  - Return: `{ error, handleError, clearError }`
  - Replace inconsistent alert/console.error patterns

---

## PHASE 3: CRITICAL - Split Large Components (Est: 56 hours)
**Impact**: 4,500+ lines better organized across 20+ files
**Risk**: Medium

### 3.1 ProcessPhotosPage.tsx (3,312 lines → 500 lines) (24 hours)

- [x] **Extract Photo Upload Step** (6 hours)
  - Create `frontend/src/components/photos/PhotoUploadStep.tsx`
  - Lines 1-800: Choice screen + file upload
  - Props: `onPhotosSelected`, `processType`, `onProcessTypeChange`

- [x] **Extract Photo Processing Step** (6 hours)
  - Create `frontend/src/components/photos/PhotoProcessingStep.tsx`
  - Lines 801-1600: OCR processing + progress indicator
  - Props: `photos`, `onComplete`, `onError`

- [x] **Extract Photo Review Step** (8 hours)
  - Create `frontend/src/components/photos/PhotoReviewStep.tsx`
  - Lines 1601-3312: Review and edit processed photos
  - Sub-components:
    - `RestaurantPhotoCard.tsx`
    - `QuickTrackPhotoCard.tsx`
    - `PhotoCardActions.tsx`

- [x] **Create Supporting Hooks** (4 hours)
  - `usePhotoUpload.ts` - Upload logic
  - `usePhotoProcessing.ts` - OCR processing logic
  - `usePhotoReview.ts` - Review/edit logic
  - Use `useReducer` for complex state management

### 3.2 HomePage.tsx (1,698 lines → 400 lines) (16 hours)

- [x] **Extract Filtering Hook** (4 hours)
  - Create `frontend/src/hooks/useVisitFilters.ts`
  - Extract filtering logic (lines 435-653)
  - Return: `{ filteredVisits, filterParams, setFilterParams }`

- [x] **Extract Grouping Hook** (3 hours)
  - Create `frontend/src/hooks/useVisitGrouping.ts`
  - Extract month/day grouping logic
  - Return: `{ groupedVisits, renderedMonths, loadMore }`

- [x] **Extract VisitCard Component** (3 hours)
  - Create `frontend/src/components/home/VisitCard.tsx`
  - Lines 1086-1290: Individual visit display
  - Props: `visit`, `onEdit`, `onDelete`, `onShare`

- [x] **Extract QuickTrackCard Component** (3 hours)
  - Create `frontend/src/components/home/QuickTrackCard.tsx`
  - Lines 1313-1446: Quick track display
  - Props: `item`, `onEdit`, `onDelete`

- [x] **Extract Supporting Components** (3 hours)
  - `VisitListHeader.tsx` - Search, filters, view toggles
  - `SharePhotoModal.tsx` - Photo sharing dialog
  - `usePhotoSharing.ts` - Photo sharing logic

### 3.3 SelectRestaurantPage.tsx (1,566 lines → 300 lines) (12 hours)

- [x] **Extract Restaurant Search Hook** (4 hours)
  - Create `frontend/src/hooks/useRestaurantSearch.ts`
  - Combine local + Google search logic
  - Return: `{ results, isSearching, search, clearSearch }`

- [x] **Extract Nearby Restaurants Hook** (3 hours)
  - Create `frontend/src/hooks/useNearbyRestaurants.ts`
  - GPS + distance sorting logic
  - Return: `{ nearbyRestaurants, currentLocation, requestLocation }`

- [x] **Extract Components** (5 hours)
  - `RestaurantSearchBar.tsx` - Search input + filters
  - `RestaurantList.tsx` - List display
  - `RestaurantCard.tsx` - Individual restaurant
  - `RecentRestaurantsBanner.tsx` - Recent visits banner

### 3.4 AddItemsToVisit.tsx (957 lines → 400 lines) (4 hours)

- [x] **Split into Sub-Components**
  - `MenuItemSearch.tsx` - Search existing items
  - `ManualItemForm.tsx` - Manual entry form
  - `OCRMenuIntegration.tsx` - OCR flow integration
  - Main component orchestrates the flow

---

## PHASE 4: CODE QUALITY - Type Safety & Standards (Est: 20 hours)
**Impact**: Better type safety, fewer runtime errors
**Risk**: Low

### 4.1 Fix Type Safety Issues

- [x] **Fix Any Types** (6 hours)
  - `ProcessPhotosPage.tsx:94` - restaurant: any → Restaurant | null
  - `AdminMenuReviewsPage.tsx` - Define MenuReview interface
  - Create type guards in `lib/pocketbase.ts`

- [x] **Add Return Types** (4 hours)
  - Add explicit return types to all async functions
  - Add to all event handlers
  - Enable stricter TypeScript rules incrementally

- [x] **Create Type Guards** (2 hours)
  - Create `isAuthenticatedUser()` type guard
  - Create guards for PocketBase record types
  - Add to `lib/pocketbase.ts`

### 4.2 Standardize Error Handling

**Status**: Sophisticated error handling system already exists (`useErrorHandler` hook + `ErrorDisplay` component).
**What's Done**: ✅ No alert() calls, ✅ PocketBase error parsing, ✅ 18 components using modern approach
**What's Left**: Migrate 20 legacy components, add offline helpers, create error constants

- [x] **Create Offline Error Helpers** (2 hours)
  - Create `lib/offlineHelpers.ts`
  - `handleOfflineSuccess()` - Standardize "queued for sync" messages
  - `isOfflineError()` - Check if error is offline-related
  - Update HomePage, QuickTrackPage, RateItemsPage to use helpers
  - Currently duplicated across 3+ pages

- [x] **Create Error Message Constants** (2 hours)
  - Create `lib/errorMessages.ts`
  - Extract hardcoded error strings ("Failed to delete visit", "Failed to add restaurant", etc.)
  - Map backend errors to user-friendly messages
  - Consistent formatting across app

- [x] **Migrate Legacy Components to useErrorHandler** (6 hours)
  - Convert 20 components from `const [error, setError] = useState("")` to `useErrorHandler`
  - Add `<ErrorDisplay>` components where missing
  - Priority components:
    - SelectRestaurantPage.tsx (line 56)
    - EditRateItemsPage.tsx
    - FriendDetailPage.tsx
    - ViewMenuItemsPage.tsx
    - AddItemsToVisit.tsx
    - + 15 others
  - Test error display in each updated component

- [ ] **Optional: Install Toast Library** (3 hours)
  - Install Sonner for global toast notifications
  - Use for transient success/info messages
  - Keep `ErrorDisplay` for contextual inline errors
  - Better UX for non-critical notifications

---

## PHASE 5: ORGANIZATION - Directory Structure (Est: 16 hours)
**Impact**: Better navigation and maintainability
**Risk**: High (lots of file moves)

### 5.1 Reorganize Components

- [x] **Create Feature-Based Structure** (8 hours)
  ```
  components/
  ├── home/           - HomePage + related
  ├── visits/         - Visit CRUD flows
  ├── quick-track/    - Quick track features
  ├── photos/         - Photo processing
  ├── profile/        - Profile + settings
  ├── friends/        - Friends features
  └── ui/             - Shared components
  ```
  - Move files carefully (use git mv for history)
  - Update all imports
  - Test after each group move

### 5.2 Organize Hooks and Utils

- [x] **Organize Hooks by Domain** (3 hours)
  ```
  hooks/
  ├── api/            - Data fetching hooks
  ├── offline/        - Offline sync hooks
  ├── ui/             - UI state hooks
  └── utils/          - General utilities
  ```

- [x] **Create Constants Directory** (2 hours)
  - Move rating options to `constants/ratings.ts`
  - Move filter options to `constants/filters.ts`
  - Extract other scattered constants

- [x] **Consolidate Draft Services** (1 hour)
  - Move draft services to hooks/
  - Consider generic `useDraftState<T>` hook

---

## PHASE 6: PERFORMANCE OPTIMIZATION (Est: 12 hours)
**Impact**: Better performance, smoother UX
**Risk**: Low

### 6.1 Optimize Re-renders

- [x] **Audit useMemo Dependencies** (4 hours)
  - Review HomePage filtering/grouping
  - Split into smaller memoized chunks
  - Optimize dependency arrays

- [x] **Add React.memo to Cards** (3 hours)
  - Memo VisitCard, QuickTrackCard
  - Memo PhotoCard components
  - Use useCallback for handlers

- [x] **Optimize Photo Preview Management** (3 hours)
  - Ensure cleanup in usePhotoManager
  - Audit all URL.createObjectURL usage
  - Add cleanup on unmount everywhere

---

## PHASE 7: BACKEND REFACTORING (Est: 8 hours)
**Impact**: Better backend organization
**Risk**: Medium

- [ ] **Split main.go into Handlers** (6 hours)
  ```
  backend/
  ├── main.go
  └── handlers/
      ├── invite_codes.go
      ├── users.go
      ├── menu_parsing.go
      └── places.go
  ```

- [ ] **Add Structured Error Responses** (2 hours)
  - Create error type structs
  - Consistent JSON error format
  - Better frontend error handling

---

## PHASE 8: TESTING & DOCUMENTATION (Est: 40 hours)
**Impact**: Safer refactoring, better onboarding
**Risk**: Low

### 8.1 Add Unit Tests

- [ ] **Test Utility Functions** (8 hours)
  - `lib/dateUtils.test.ts`
  - `lib/ratingConstants.test.ts`
  - `lib/validationUtils.test.ts`

- [ ] **Test Custom Hooks** (16 hours)
  - `hooks/api/*.test.ts`
  - `hooks/usePhotoManager.test.ts`
  - `hooks/useVisitFilters.test.ts`
  - Use @testing-library/react-hooks

- [ ] **Test Key Components** (16 hours)
  - `RatingSelector.test.tsx`
  - `DatePickerField.test.tsx`
  - `VisibilityToggle.test.tsx`
  - `VisitCard.test.tsx`

### 8.2 Update Documentation

- [ ] **Document New Component Patterns** (2 hours)
  - Update CLAUDE.md with component guidelines
  - Document shared component usage
  - Add hook usage examples

---

## BONUS: STYLING IMPROVEMENTS (Optional)

- [ ] **Create Tailwind Utility Classes** (4 hours)
  - Extract repeated class combinations
  - Create `lib/cn.ts` with common patterns
  - Or create wrapper components (FlexCenter, Card, etc.)

- [ ] **Define Design System Constants** (2 hours)
  - Spacing scale
  - Size constants
  - Color palette (if not using Tailwind defaults)

---

## EXECUTION STRATEGY

### Week 1-2: Quick Wins
- Phase 1: Extract reusable components (16 hours)
- Phase 2: Create centralized hooks (20 hours)
- **Deliverable**: 200+ lines saved, established patterns

### Week 3-4: Major Refactors
- Phase 3.1: Split ProcessPhotosPage (24 hours)
- Phase 3.2: Split HomePage (16 hours)
- **Deliverable**: Main components split and organized

### Week 5-6: Quality & Organization
- Phase 3.3-3.4: Split remaining large components (16 hours)
- Phase 4: Type safety & standards (20 hours)
- Phase 5: Directory reorganization (16 hours)
- **Deliverable**: Clean, organized codebase

### Week 7-8: Testing & Polish
- Phase 6: Performance optimization (12 hours)
- Phase 7: Backend refactoring (8 hours)
- Phase 8: Testing & documentation (40 hours)
- **Deliverable**: Well-tested, documented codebase

---

## SUCCESS METRICS

- [ ] Reduce ProcessPhotosPage from 3,312 → 500 lines (85% reduction)
- [ ] Reduce HomePage from 1,698 → 400 lines (76% reduction)
- [ ] Eliminate 200+ lines of duplicated code
- [ ] Achieve 80%+ test coverage for utilities and hooks
- [ ] Zero `any` types in critical paths
- [ ] Consistent error handling across all components
- [ ] Bundle size reduction by 10%+ via code splitting

---

## ROLLBACK PLAN

- Use feature branches for each phase
- Test thoroughly before merging
- Keep E2E tests passing at all times
- Can revert individual phases if issues arise

---

# FEATURE TODOS (Existing)

- maybe in scanning menu for items, double check if the restaurant name corresponds to the restaurant selected, and then if there's discrepancy, alert the user to let them know what they want to do (i.e. still proceed with the menu or cancel it)
- add a feature that allows a user to input their receipt and be able to assign "friends" to each individual item, along with being able to add a tax percentage and tips to help split bills
    - add ability to make split even more advanced by allowing user to assign tip split percentage according to "friend"
- ability to see people's average scores according to all their records
    - ability to see people's average score according to food and restaurant type
    - in friends tab, it will show the average score for the user
    - there will be a cron job that happens every month where it sends the data up to gemini to generate some scores according to their ratings that will be public for them and their friends, and friends can view these since it will be historical
    - (paid feature) users can view their and their friend's current up to date ratings if they want to and it will only show for them (analyzed up to the current date)
    - (paid feature) users can view their own rating analysis according to month/year
    - have a compatibility score from user to their friends
- friend leaderboard
- restaurant lists
    - create some suggested places to go to with friends that have "bookmarked" the same restaurant
    - have an exploratory map, similar to google maps, that provides information that can be collected from google, and allow user to bookmark to their lists (have a default list people can add to, but then also make it easy to transfer that place to another list)
- add a map view to the home page
    - allow for user to toggle their own locations as well as their own friends
    - add a "toggleable bottom tray" that shows up with the list of visits records

- remove the feedback tab and put it into the "profile" tab and replace the feedback tab with additional features, i.e. the lists feature and bill split management feature

- in the friends tab, add another tab in the "friends/add friend" which will eventually be a "group rating session", where the user can create a ephemeral group where the user sets up the restaurants + menu items the group is going to rate (i.e. hangout where someone buys 10 teas from 10 stores to try out), and then there's a code that someone can provide. then users on the app can enter that code in and then it will prepopulate the restaurants + menu items in the order the creator made. then after each rating, then group can view everyone's ratings before the group eventually disappears, but everyone's ratings will be saved

- in the homepage feed, add a way to collapse single day visits too
- in add quick track item, when I go into an input, and the footer with the tabs and the next/cancel buttons are supposed to disappear, there's still a white bar at the bottom, and then when i exit the input, the white bar shows up above the tabs and below the next/cancel buttons
- in the add new, can you also add a way for a user to just write down notes for what they are going to process next? i.e. user goes to a restaurant and types in the restaurant name in freeform notes, and also what they ordered, and then they would also like to add a photo then too. and then this would be a "saved note entry" for the user to then be able to process later
- add a way for the user to toggle a notification to be sent to the user to either process the note afterwards or to just generally notify the user to track what they just ate
- when a user is selecting restaurants, currently, they will select a specific google maps location or restaurant they created. what happens when the user goes to a "chain" or similar restaurant names" to view what they ordered? how do we showcase this to the user?
  - right now, when a user searches for a restaurant, we can see if they or their friends went to the place, but not what they ordered, can we think of a way to showcase what the user or their friends ordered?
  - in the quick track item, there's also no way to see if a user has already eaten that item before
  - in the process saved photos, there's also no way for the user to see if they or their friends have been to the same restaurant before, can we think of a way to showcase what the user or their friends ordered before?

- add better one click registration options (currently, the verification email sent by Resend is super slow and it's causing a lot of people I ask to use the app to stop prematurely)
- implement PostHog and also related actions to track in PostHog
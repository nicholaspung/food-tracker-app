# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a mobile food tracker application built with:
- **Frontend**: Tauri v2 desktop app with React 19, TypeScript, and Vite
- **PWA Support**: Progressive Web App capabilities via vite-plugin-pwa (works on Android & iOS browsers)
- **Backend**: Go-based PocketBase server (v0.30.1) running on port 8090
- **Routing**: TanStack Router with file-based routing
- **Styling**: Tailwind CSS v4 with shadcn/ui components
- **State Management**: TanStack Query and TanStack Form
- **Testing**: Cypress for end-to-end browser testing

**Distribution Options:**
- **Native App**: Tauri wrapper for desktop/mobile (uses localhost:8090)
- **Web App (PWA)**: Installable web app for browsers (requires deployed backend)
- See `PWA_DEPLOYMENT.md` for complete PWA deployment guide

**IMPORTANT: Mobile-First Design**
- This is a **mobile-native application** - all features MUST be designed for mobile devices
- **Full-width design**: All components should use full width (`w-full` or `className="w-full"`)
- **No responsive breakpoints**: Do NOT use `md:`, `lg:`, `xl:` breakpoints - mobile only!
- **Single column layouts**: Stack elements vertically, no multi-column layouts
- Use mobile-appropriate UI patterns (bottom navigation, mobile gestures, mobile-friendly touch targets)
- Minimum touch target size: 44x44px for all interactive elements
- Text should be readable without zoom (minimum 16px font size for body text)

**Offline Data Sync**
- The app supports full offline functionality via IndexedDB-based sync queue
- All mutations (create/update/delete) are queued when offline and auto-sync when online
- Use `useOfflineCreate`, `useOfflineUpdate`, `useOfflineDelete` hooks for offline-aware mutations
- See `OFFLINE_SYNC.md` for complete documentation and usage examples
- Sync status indicator automatically shows pending/failed operations

## Development Commands

### Frontend Development
```bash
cd frontend
npm run dev              # Start Vite dev server (port 1420)
npm run build            # TypeScript check + production build
npm run preview          # Preview production build
npm run tauri            # Tauri CLI commands
```

### Backend Development
```bash
cd backend
go run main.go serve     # Start PocketBase server (port 8090)
```

**System Dependencies:**
- **libheif** - Required for HEIC/HEIF image conversion
  - Ubuntu/Debian: `sudo apt-get install libheif-dev`
  - macOS: `brew install libheif`
  - Required by the `/api/convert-heic` endpoint for iPhone photo uploads

### E2E Testing
```bash
cd frontend
npm run test:e2e         # Run all tests (starts dev server automatically)
npm run cypress:open     # Open Cypress test runner (interactive)
npm run cypress:run      # Run tests headless (requires dev server running)
```

Test files are in `frontend/cypress/e2e/`. The `test:e2e` command auto-starts the dev server and runs tests.

**Pre-push Hook**: Tests automatically run before `git push`. Set up with `./setup-hooks.sh` from project root.

## Architecture

### Frontend Architecture

#### Directory Structure

```
frontend/src/
├── components/          # React components organized by feature
│   ├── auth/           # Authentication (login, signup, OAuth, password reset)
│   ├── bills/          # Bill splitting functionality
│   ├── home/           # Home page (visit cards, quick track cards, header)
│   ├── lists/          # Restaurant lists feature
│   ├── photos/         # Photo processing and upload
│   ├── profile/        # User profile and friends
│   ├── quick-track/    # Quick track feature
│   ├── settings/       # Settings, feedback, admin, beta features
│   ├── shared/         # Shared components across features
│   ├── ui/             # shadcn/ui components (button, card, dialog, etc.)
│   └── visits/         # Visit-related components
│       ├── add/        # Add visit flow
│       ├── edit/       # Edit visit flow
│       └── shared/     # Shared visit components
├── hooks/              # Custom React hooks organized by purpose
│   ├── api/            # TanStack Query data fetching hooks
│   ├── auth/           # Authentication hooks (OAuth)
│   ├── menu/           # Menu OCR and item selection
│   ├── offline/        # Offline-aware mutation hooks
│   ├── photos/         # Photo upload and processing
│   ├── restaurants/    # Restaurant search and nearby
│   ├── ui/             # UI utilities (error handling, geolocation)
│   └── visits/         # Visit filtering and grouping
├── repositories/       # Repository pattern for PocketBase collections
├── services/           # Business logic services
├── lib/                # Utilities and library configurations
├── contexts/           # React Context providers
├── constants/          # Centralized constants
├── stores/             # Zustand/state stores
├── types/              # TypeScript type definitions
└── routes/             # TanStack Router file-based routes
```

#### Component Organization

**Components are organized by feature, not by type.** Each feature folder contains all related components:

```typescript
// ✅ CORRECT: Feature-based organization
components/
  auth/
    LoginPage.tsx
    SignUpPage.tsx
    OAuthButton.tsx
    OnboardingDialog.tsx
  visits/
    add/AddVisitOptionSelector.tsx
    edit/EditRateItemsPage.tsx

// ❌ WRONG: Type-based organization (don't do this)
components/
  pages/
    LoginPage.tsx
    SignUpPage.tsx
  buttons/
    OAuthButton.tsx
  dialogs/
    OnboardingDialog.tsx
```

#### Hooks Organization

**Hooks are organized by purpose:**

- **`hooks/api/`** - TanStack Query hooks for data fetching
  - `useVisits.ts` - Fetch visits with optional filters
  - `useRestaurants.ts` - Fetch and manage restaurants
  - `useFoodItems.ts` - Fetch food items
  - `useMenuItems.ts` - Fetch menu items from OCR
  - `useFriendships.ts` - Manage friend relationships
  - `useRestaurantLists.ts` - Fetch and manage lists

- **`hooks/offline/`** - Offline-aware mutation hooks
  - `useOfflineVisitCreation.ts` - Create visits with offline support
  - `useOfflineQuickTrack.ts` - Create quick track items offline
  - `useOfflineQuickTrackUpdate.ts` - Update quick track items offline
  - `useOfflineQuickTrackDelete.ts` - Delete quick track items offline
  - `useOfflineRestaurantCreation.ts` - Create restaurants offline
  - `useOfflineListOperations.ts` - List operations offline
  - `useOfflineMutation.ts` - Generic offline mutation hook

- **`hooks/ui/`** - UI-related hooks
  - `useErrorHandler.ts` - Standardized error handling
  - `useGeolocation.ts` - Get user location
  - `useKeyboardVisible.ts` - Detect mobile keyboard

- **`hooks/menu/`** - Menu-related hooks
  - `useMenuOCR.ts` - OCR processing for menus
  - `useMenuItemSelection.ts` - Select items from OCR results
  - `useMenuItemSearch.ts` - Search menu items
  - `useMenuReviewRequest.ts` - Request menu review

- **`hooks/photos/`** - Photo-related hooks
  - `usePhotoUpload.ts` - Upload photos
  - `usePhotoProcessing.ts` - Process photos
  - `usePhotoManager.ts` - Manage photo state
  - `useDraftManagement.ts` - Manage photo drafts

#### Repository Pattern

**ALWAYS use repositories instead of direct `pb.collection()` calls.**

All PocketBase collections are accessed through a repository layer that provides:
- Type safety
- Centralized query logic
- Consistent error handling
- Easier testing

```typescript
// ✅ CORRECT: Use repositories
import { repositories } from '@/repositories';

const visits = await repositories.visits.getFullList({
  sort: '-visitDate',
  expand: 'restaurant,user',
});

const visit = await repositories.visits.create({
  restaurant: restaurantId,
  user: userId,
  visitDate: new Date().toISOString(),
});

// ❌ WRONG: Direct pb.collection() calls
import { pb } from '@/lib/pocketbase';

const visits = await pb.collection('visits').getFullList(); // Don't do this!
```

**Available Repositories:**
- `repositories.visits` - Visit management
- `repositories.restaurants` - Restaurant management
- `repositories.foodItems` - Food item management
- `repositories.bills` - Bill splitting
- `repositories.menus` - Menu items and images
- `repositories.friendships` - Friend relationships
- `repositories.feedback` - User feedback
- `repositories.lists` - Restaurant lists
- `repositories.visitPhotos` - Visit photos
- `repositories.users` - User management
- `repositories.inviteCodes` - Invite code management

See `frontend/src/repositories/README.md` for complete documentation.

#### Service Layer

**Services contain business logic that's too complex for hooks:**

- `photoService.ts` - Complex photo processing logic
- `ocrService.ts` - OCR integration and processing
- `googlePlaces.ts` - Google Places API integration
- `menuReviewService.ts` - Menu review requests
- `draftServiceFactory.ts` - Draft management factory
- `billService.ts` - Bill calculation and validation

#### Constants

**All magic values are centralized in `constants/`:**

```typescript
// ✅ CORRECT: Import from constants
import { COLLECTIONS } from '@/constants/collections';
import { INITIAL_MONTHS_TO_LOAD } from '@/constants';
import { visitKeys } from '@/constants/queryKeys';

// Query keys for TanStack Query
const { data } = useQuery({
  queryKey: visitKeys.all,
  queryFn: () => repositories.visits.getFullList(),
});

// ❌ WRONG: Hard-coded magic values
const { data } = useQuery({
  queryKey: ['visits'], // Use visitKeys.all instead!
  queryFn: () => repositories.visits.getFullList(),
});
```

**Available Constants:**
- `collections.ts` - PocketBase collection names
- `queryKeys.ts` - TanStack Query cache keys
- `ratings.ts` - Rating system constants
- `filters.ts` - Filter options
- `limits.ts` - Pagination and limits
- `pagination.ts` - Pagination defaults
- `offline.ts` - Offline sync constants
- `quickTrack.ts` - Quick track constants
- `feedback.ts` - Feedback form constants

#### Routing

**TanStack Router with file-based routing** in `frontend/src/routes/`:

Key routes:
- `__root.tsx` - Root layout component
- `index.tsx` - Login page (/)
- `signup.tsx` - Sign up page
- `home.tsx` - Home page (post-login)
- `profile.tsx` - User profile page
- `friends.tsx` - Friends management
- `settings.tsx` - Settings page
- `add-visit.tsx` - Add visit flow (multi-step)
- `add-visit.select-restaurant.tsx` - Restaurant selection
- `add-visit.add-items.tsx` - Add food items
- `add-visit.rate-items.tsx` - Rate food items
- `edit-visit.$visitId.tsx` - Edit visit
- `quick-track.tsx` - Quick track page
- `edit-quick-track.$itemId.tsx` - Edit quick track item
- `process-photos.tsx` - Photo processing page
- `feedback.tsx` - Feedback list
- `feedback.$feedbackId.tsx` - Feedback detail
- `beta.tsx` - Beta features page
- `admin/menu-reviews.tsx` - Admin menu reviews

Routes are auto-generated into `routeTree.gen.ts` by TanStack Router plugin.

**Path alias:** `@/` maps to `frontend/src/`

### Backend Architecture

**PocketBase** - Embedded database and API server (Go-based BaaS)

#### Directory Structure

```
backend/
├── main.go              # Main entry point
├── handlers/            # Custom API endpoint handlers
│   ├── invite_codes.go  # Invite code endpoints
│   ├── menu_parsing.go  # Menu OCR endpoints
│   ├── places.go        # Google Places proxy
│   └── users.go         # User lookup endpoints
├── errors/              # Custom error types
└── migrations/          # Database migrations
```

#### Collections

- `users` - User authentication and profiles
- `invite_codes` - Invite code system
- `friendships` - Friend relationships
- `restaurants` - Restaurant tracking
- `food_items` - Food items (both visit-based and quick track)
- `visits` - Restaurant visits
- `visit_photos` - Photos of food items
- `menu_images` - Uploaded menu photos for OCR
- `menu_items` - Menu items extracted from photos
- `bills` - Bill splitting records
- `bill_invites` - Bill split invitations
- `lists` - Restaurant lists
- `list_items` - Items in lists
- `feedback` - User feedback

#### Custom API Endpoints

- `POST /api/convert-heic` - Converts HEIC/HEIF images to JPEG (requires auth)
- `GET /api/invite-codes/inviter/{code}` - Get inviter info from invite code
- `GET /api/users/by-friend-code/{code}` - Find user by friend code
- `GET /api/invite-codes` - Get unused invite codes for authenticated user
- `POST /api/invite-codes/generate` - Generate new invite codes (initial user only)
- `POST /api/menu/parse` - Parse menu from image using OCR
- `GET /api/places/autocomplete` - Google Places autocomplete proxy
- `GET /api/places/details` - Google Places details proxy

### Tauri Integration

- Tauri configuration in `frontend/src-tauri/`
- Rust crate name: `mobile_tracker_app_lib`
- Uses tauri-plugin-opener for external links
- Dev server must run on port 1420 (strict port requirement)

## Common Patterns

### Error Handling Pattern

**ALWAYS use the `useErrorHandler` hook for consistent error handling:**

```typescript
import { useErrorHandler } from '@/hooks/ui/useErrorHandler';

function MyComponent() {
  const { error, handleError, clearError, showSuccess, showValidation, checkOffline } = useErrorHandler({
    source: 'MyComponent',
    autoClearMs: 5000, // Auto-clear after 5 seconds
  });

  const handleSubmit = async () => {
    // Validation
    if (!email) {
      showValidation('Email is required');
      return;
    }

    // Offline check
    if (checkOffline()) {
      return; // Error shown automatically
    }

    try {
      await someOperation();
      showSuccess('Operation completed!');
    } catch (err) {
      handleError(err, {
        severity: 'error',
        retryable: true,
        customMessage: 'Failed to complete operation'
      });
    }
  };

  return (
    <div>
      {error && (
        <div className={`p-4 rounded ${
          error.severity === 'error' ? 'bg-red-50 text-red-800' :
          error.severity === 'warning' ? 'bg-yellow-50 text-yellow-800' :
          'bg-blue-50 text-blue-800'
        }`}>
          {error.message}
        </div>
      )}
      {/* Component content */}
    </div>
  );
}
```

### Offline Mutation Pattern

**For mutations that should work offline, use offline hooks:**

```typescript
import { useOfflineVisitCreation } from '@/hooks/offline/useOfflineVisitCreation';

function AddVisit() {
  const createVisit = useOfflineVisitCreation();

  const handleSubmit = async () => {
    try {
      // This will work online or offline
      await createVisit.mutateAsync({
        restaurant: restaurantId,
        visitDate: new Date().toISOString(),
        visibility: 'friends',
      });
    } catch (error) {
      // Handle error
    }
  };
}
```

**Available offline hooks:**
- `useOfflineVisitCreation` - Create visits
- `useOfflineQuickTrack` - Create quick track items
- `useOfflineQuickTrackUpdate` - Update quick track items
- `useOfflineQuickTrackDelete` - Delete quick track items
- `useOfflineRestaurantCreation` - Create restaurants
- `useOfflineListOperations` - List CRUD operations
- `useOfflineMutation` - Generic offline mutation

### Data Fetching Pattern

**Use TanStack Query hooks for all data fetching:**

```typescript
import { useVisits } from '@/hooks/api/useVisits';
import { useFoodItems } from '@/hooks/api/useFoodItems';

function MyComponent() {
  const { data: visits = [], isLoading } = useVisits({
    expand: 'restaurant,user',
    sort: '-visitDate',
  });

  const { data: foodItems = [] } = useFoodItems();

  if (isLoading) {
    return <LoadingState fullScreen message="Loading..." />;
  }

  // Use data
}
```

### Styling Pattern

**Full-width mobile design with Tailwind CSS:**

```typescript
// ✅ CORRECT: Full-width mobile design
function MyComponent() {
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header - full width */}
      <header className="w-full p-4 bg-white border-b">
        <h1 className="text-xl font-semibold">Title</h1>
      </header>

      {/* Content - full width, scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Card className="w-full"> {/* Full width card */}
          <CardContent className="p-4">
            <Button className="w-full"> {/* Full width button */}
              Click Me
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Footer/Bottom nav - full width */}
      <footer className="w-full p-4 bg-white border-t">
        {/* Bottom navigation */}
      </footer>
    </div>
  );
}

// ❌ WRONG: Responsive breakpoints (don't use md:, lg:, xl:)
function BadComponent() {
  return (
    <div className="container mx-auto max-w-lg"> {/* Don't constrain width! */}
      <div className="grid md:grid-cols-2"> {/* No responsive grids! */}
        {/* Content */}
      </div>
    </div>
  );
}
```

**Styling Guidelines:**
- Always use `w-full` for containers
- No `max-w-*` constraints (except for dialogs/modals)
- No responsive breakpoints (`md:`, `lg:`, `xl:`)
- Stack elements vertically with `flex flex-col`
- Use `space-y-*` for vertical spacing
- Minimum touch targets: 44x44px (`min-h-[44px]`)
- Use Tailwind utilities - no custom CSS

### Form Pattern

**Use TanStack Form for form management:**

```typescript
import { useForm } from '@tanstack/react-form';

function MyForm() {
  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
    },
    onSubmit: async ({ value }) => {
      // Handle submission
    },
  });

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      form.handleSubmit();
    }}>
      <form.Field name="name">
        {(field) => (
          <Input
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
          />
        )}
      </form.Field>
      {/* More fields */}
    </form>
  );
}
```

### Loading and Empty States

**Use consistent loading and empty state components:**

```typescript
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

function MyComponent() {
  const { data, isLoading, error } = useQuery(...);

  if (isLoading) {
    return <LoadingState fullScreen message="Loading visits..." />;
  }

  if (error) {
    return <ErrorState
      message="Failed to load visits"
      onRetry={refetch}
    />;
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center pt-8">
        <Utensils className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-gray-500 text-center">No visits yet</p>
        <Button onClick={handleAdd} className="mt-4">
          <Plus className="w-5 h-5 mr-2" />
          Add Visit
        </Button>
      </div>
    );
  }

  // Render data
}
```

## Development Workflow

When adding features:
1. **Analyze existing patterns** - Look for similar features to reuse patterns
2. **Use repositories** - Never use direct `pb.collection()` calls
3. **Use offline hooks** - For mutations that should work offline
4. **Use error handling hook** - For consistent error handling
5. **Follow mobile-first design** - Full-width, no responsive breakpoints
6. **Add E2E tests** - in `frontend/cypress/e2e/`
7. **Run tests** - `npm run test:e2e` to verify tests pass
8. **Address failures** - Fix any test failures before completion

**Pre-push Testing:**
- Tests automatically run before `git push` via pre-push hook
- Hook checks if backend is running before running tests
- Push is blocked if tests fail
- Skip hook with `git push --no-verify` (not recommended)

## Best Practices

### Component Design

1. **Feature-based organization** - Group related components by feature
2. **Full-width mobile design** - All components should use full width
3. **Single responsibility** - Each component does one thing well
4. **Extract custom hooks** - Complex logic goes in hooks
5. **Use TypeScript** - Full type safety for all components
6. **Minimize prop drilling** - Use context for deeply nested state

### Data Management

1. **Use repositories** - Never call `pb.collection()` directly
2. **Use query hooks** - TanStack Query for all data fetching
3. **Use offline hooks** - For mutations that should work offline
4. **Centralize constants** - No magic strings or numbers
5. **Type everything** - Full TypeScript type safety

### Error Handling

1. **Use useErrorHandler** - Consistent error handling across app
2. **Show user-friendly messages** - Don't expose technical errors
3. **Handle offline gracefully** - Check offline status before mutations
4. **Log errors** - Use `logger.error()` for debugging

### Performance

1. **Optimize renders** - Use `useMemo` for expensive computations
2. **Use O(1) lookups** - Convert arrays to Maps for frequent lookups
3. **Lazy load images** - Use native lazy loading
4. **Virtualize long lists** - For lists with 100+ items
5. **Invalidate selectively** - Don't invalidate all queries

## Subagent Usage (for Claude Code)

**Proactively use subagents** from `.claude/subagents/` for the following tasks:

- **code-analyzer**: ALWAYS use BEFORE implementing new features to find reusable code
- **feature-implementer**: Use when user requests a new feature or page
- **test-runner**: Use after code changes to run and analyze E2E tests
- **code-reviewer**: Use after implementing significant features (optional, can ask user first)
- **bug-fixer**: Use when user reports a bug or issue
- **refactoring-agent**: Use when user requests refactoring or code improvement
- **documentation-writer**: Use when user requests documentation updates

**Workflow example:**
1. User: "Add a notifications page"
2. Claude: Invoke `code-analyzer` to find reusable patterns
3. Claude: Invoke `feature-implementer` to build the feature
4. Claude: Invoke `test-runner` to verify tests pass
5. Claude: (Optionally) Invoke `code-reviewer` to review the implementation

## Key Dependencies

### Frontend
- **React**: v19.1.0
- **TanStack Router**: v1.132.41 (file-based routing)
- **TanStack Query**: v5.90.2 (server state)
- **TanStack Form**: v1.23.5 (form management)
- **PocketBase JS SDK**: v0.26.2
- **Cypress**: v13.17.0 (E2E testing)
- **Tailwind CSS**: v4.1.14
- **TypeScript**: v5.8.3

### Backend
- **PocketBase**: v0.30.1 (Go-based BaaS)
- **goheif**: github.com/jdeng/goheif (HEIC image conversion)
- **System Dependency**: libheif library (for HEIC/HEIF support)

## Testing Notes

- Tests use `data-testid` attributes for selecting elements
- Each test should be independent and isolated
- localStorage is cleared before each test
- Screenshots captured on test failures
- Tests run locally only (no CI) via pre-push git hook
- Mobile viewport: 428x926
- Custom commands: `cy.login(email, password)`, `cy.logout()`

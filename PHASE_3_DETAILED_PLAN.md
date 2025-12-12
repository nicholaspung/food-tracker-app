# Phase 3: ProcessPhotosPage Refactoring - Detailed Implementation Plan

**File**: `frontend/src/components/ProcessPhotosPage.tsx` (3,206 lines → ~300 lines)
**Goal**: Split into modular, maintainable components while preserving all functionality
**Approach**: Incremental refactoring with testing after each step

---

## Overview

The ProcessPhotosPage handles two distinct workflows:
1. **Restaurant Visit Mode**: Upload photos → select restaurant → add menu items → rate → review
2. **Quick Track Mode**: Upload photos → add item details → review

Current structure has 4 main screens:
- **Choice Screen** (~line 1926): Choose between restaurant/quick track mode
- **Upload Screen** (~line 1995): File selection
- **Processing Screen** (~line 2154): Form for each photo (has 2 sub-modes)
- **Review Screen** (~line 1638): Preview before submission (has 2 sub-modes)

---

## Pre-Refactoring Setup (1 hour)

### Step 0.1: Create Directory Structure
```bash
mkdir -p frontend/src/components/photos
mkdir -p frontend/src/components/photos/steps
mkdir -p frontend/src/components/photos/restaurant
mkdir -p frontend/src/components/photos/quicktrack
mkdir -p frontend/src/hooks/photos
mkdir -p frontend/src/types/photos
```

### Step 0.2: Create Shared Types File
**File**: `frontend/src/types/photos.ts`

Extract all type definitions from ProcessPhotosPage:
- `ScreenState` type
- `ProcessType` type
- `PhotoToProcess` interface
- `ProcessedPhoto` interface
- `QuickTrackPhotoData` interface
- `RestaurantSelectorProps` interface
- `StoredCameraResult` interface

**Dependencies**: None
**Test**: Import types in ProcessPhotosPage, run `npm run build`

---

## Phase 1: Extract Utility Functions & Helpers (2 hours)

### Step 1.1: Extract Photo Utilities
**File**: `frontend/src/lib/photoUtils.ts`

Extract:
- `extractImageCaptureDate()` function (lines 145-181)
- Any other photo-related utility functions

**Dependencies**: exifreader
**Test**: Unit test for EXIF date extraction

### Step 1.2: Create Photo Type Guards
**File**: `frontend/src/types/photos.ts` (add to existing)

Add type guards if needed:
- `isRestaurantMode(type: ProcessType): boolean`
- `isQuickTrackMode(type: ProcessType): boolean`

**Test**: TypeScript compilation

---

## Phase 2: Extract Restaurant Selector Component (4 hours)

### Step 2.1: Extract RestaurantSelector Component
**File**: `frontend/src/components/photos/restaurant/RestaurantSelector.tsx`

Extract the entire `RestaurantSelector` component (lines ~183-700):
- Move component definition
- Include all sub-components (Add Restaurant form, search tabs, etc.)
- Keep all props and prop types

**Dependencies**:
- UI components (Button, Card, Input, Tabs, etc.)
- Icons from lucide-react
- `searchAndCacheRestaurantsByText` service
- Restaurant type from pocketbase

**Props**:
```typescript
interface RestaurantSelectorProps {
  selectedRestaurant: Restaurant | null;
  onRestaurantSelected: (restaurant: Restaurant) => void;
  restaurants: Restaurant[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  locationQuery: string;
  onLocationQueryChange: (query: string) => void;
  isOnline: boolean;
  onOpenCamera?: () => void;
  previousRestaurant?: Restaurant | null;
  onUsePreviousRestaurant?: () => void;
  showSameAsAbove?: boolean;
  restaurantCreationMutation: any;
}
```

**Test**:
- Verify restaurant selection still works
- Test camera mode integration
- Test Google Places search
- Test "Add New Restaurant" flow

### Step 2.2: Extract RestaurantSelector Sub-components (Optional)
Can be done later if component is still too large:
- `RestaurantSearchTab.tsx`
- `RestaurantCameraTab.tsx`
- `RestaurantHistoryTab.tsx`
- `AddRestaurantForm.tsx`

---

## Phase 3: Extract Custom Hooks (6 hours)

### Step 3.1: Create `usePhotoUpload` Hook
**File**: `frontend/src/hooks/photos/usePhotoUpload.ts`

**Responsibilities**:
- Handle file selection from input
- Extract EXIF dates from photos
- Create PhotoToProcess objects
- Save to draft service

**State Managed**:
- `photos: PhotoToProcess[]`
- `currentPhotoIndex: number`

**Methods**:
```typescript
interface UsePhotoUpload {
  photos: PhotoToProcess[];
  currentPhotoIndex: number;
  handlePhotoSelect: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  setCurrentPhotoIndex: (index: number) => void;
  clearPhotos: () => void;
}
```

**Dependencies**:
- `extractImageCaptureDate` from photoUtils
- `processPhotosDraftService`

**Test**: Upload photos, verify EXIF extraction, check draft saving

### Step 3.2: Create `usePhotoProcessing` Hook (Restaurant Mode)
**File**: `frontend/src/hooks/photos/usePhotoProcessing.ts`

**Responsibilities**:
- Manage form state for current photo
- Handle restaurant selection
- Handle menu item selection/creation
- Handle rating/notes
- Process current photo and move to next
- Manage processed photos array

**State Managed**:
- `selectedRestaurant`
- `selectedMenuItem`
- `menuItemName`
- `menuItemSearchQuery`
- `menuItemSelectionMode`
- `rating`
- `notes`
- `photoDate`
- `processedPhotos`
- `menuItemPhotoPreview` (via usePhotoManager)
- Dialog states

**Methods**:
```typescript
interface UsePhotoProcessing {
  // State
  selectedRestaurant: Restaurant | null;
  selectedMenuItem: MenuItem | null;
  menuItemName: string;
  rating: number | null;
  notes: string;
  photoDate: Date;
  processedPhotos: ProcessedPhoto[];

  // Setters
  setSelectedRestaurant: (r: Restaurant | null) => void;
  setSelectedMenuItem: (m: MenuItem | null) => void;
  setMenuItemName: (name: string) => void;
  setRating: (r: number | null) => void;
  setNotes: (notes: string) => void;
  setPhotoDate: (date: Date) => void;

  // Actions
  handleSubmitCurrent: (photo: PhotoToProcess) => Promise<void>;
  resetForm: () => void;
  canSubmitCurrent: boolean;
}
```

**Dependencies**:
- `usePhotoManager` hook
- Draft service

**Test**: Process multiple photos, verify state management

### Step 3.3: Create `useQuickTrackProcessing` Hook
**File**: `frontend/src/hooks/photos/useQuickTrackProcessing.ts`

**Responsibilities**:
- Manage quick track form state
- Process quick track photos
- Manage quick track photos array

**State Managed**:
- `qtItemName`
- `qtCategory`
- `qtRating`
- `qtLocationText`
- `qtNotes`
- `qtDate`
- `qtVisibility`
- `quickTrackPhotos`

**Methods**:
```typescript
interface UseQuickTrackProcessing {
  // State
  itemName: string;
  category: string;
  rating: number | null;
  locationText: string;
  notes: string;
  date: string;
  visibility: "friends" | "private";
  quickTrackPhotos: QuickTrackPhotoData[];

  // Setters
  setItemName: (name: string) => void;
  setCategory: (cat: string) => void;
  setRating: (r: number | null) => void;
  setLocationText: (loc: string) => void;
  setNotes: (notes: string) => void;
  setDate: (date: string) => void;
  setVisibility: (v: "friends" | "private") => void;

  // Actions
  handleSubmitCurrent: (photo: PhotoToProcess) => Promise<void>;
  resetForm: () => void;
  canSubmitCurrent: boolean;
}
```

**Test**: Process quick track photos, verify state

### Step 3.4: Create `useDraftManagement` Hook
**File**: `frontend/src/hooks/photos/useDraftManagement.ts`

**Responsibilities**:
- Load draft on mount
- Save draft on state changes
- Clear draft on completion/cancel

**Methods**:
```typescript
interface UseDraftManagement {
  isRestoringData: boolean;
  loadDraft: () => Promise<DraftData | null>;
  saveDraft: (data: DraftData) => Promise<void>;
  clearDraft: () => Promise<void>;
}
```

**Dependencies**:
- `processPhotosDraftService`

**Test**: Save/load draft, verify persistence

### Step 3.5: Create `usePhotoSubmission` Hook
**File**: `frontend/src/hooks/photos/usePhotoSubmission.ts`

**Responsibilities**:
- Submit restaurant visits
- Submit quick track items
- Handle submission errors
- Navigate on success

**Methods**:
```typescript
interface UsePhotoSubmission {
  isSubmitting: boolean;
  submitRestaurantVisits: (
    photos: ProcessedPhoto[],
    visibility: "friends" | "private"
  ) => Promise<void>;
  submitQuickTrackItems: (
    items: QuickTrackPhotoData[]
  ) => Promise<void>;
}
```

**Dependencies**:
- `useOfflineVisitCreation`
- `useOfflineQuickTrack`
- `useNavigate`
- Draft service

**Test**: Submit visits, verify navigation and draft cleanup

---

## Phase 4: Extract Screen Components (12 hours)

### Step 4.1: Extract Choice Screen
**File**: `frontend/src/components/photos/steps/ChoiceScreen.tsx`

**Extract**: Lines ~1926-1994 (Choice screen rendering)

**Props**:
```typescript
interface ChoiceScreenProps {
  onSelectType: (type: ProcessType) => void;
}
```

**Component Content**:
- Two cards: Restaurant visit vs Quick track
- Icons and descriptions
- Back button to navigate away

**Test**:
- Click restaurant button
- Click quick track button
- Verify navigation

### Step 4.2: Extract Upload Screen
**File**: `frontend/src/components/photos/steps/UploadScreen.tsx`

**Extract**: Lines ~1995-2153 (Upload screen rendering)

**Props**:
```typescript
interface UploadScreenProps {
  processType: ProcessType;
  onPhotosSelected: (files: FileList) => Promise<void>;
  onBack: () => void;
  isRestoringData: boolean;
}
```

**Component Content**:
- File input with styling
- Upload button
- Back button
- Loading overlay for draft restoration

**Test**:
- Select photos
- Verify file handling
- Test back navigation

### Step 4.3: Extract Quick Track Processing Screen
**File**: `frontend/src/components/photos/steps/QuickTrackProcessingScreen.tsx`

**Extract**: Lines ~2157-2372 (Quick Track processing screen)

**Props**:
```typescript
interface QuickTrackProcessingScreenProps {
  // Photo data
  currentPhoto: PhotoToProcess;
  currentPhotoIndex: number;
  totalPhotos: number;

  // Form state (from useQuickTrackProcessing)
  itemName: string;
  category: string;
  rating: number | null;
  locationText: string;
  notes: string;
  date: string;
  visibility: "friends" | "private";

  // Form handlers
  onItemNameChange: (name: string) => void;
  onCategoryChange: (cat: string) => void;
  onRatingChange: (r: number | null) => void;
  onLocationTextChange: (loc: string) => void;
  onNotesChange: (notes: string) => void;
  onDateChange: (date: string) => void;
  onVisibilityChange: (v: "friends" | "private") => void;

  // Actions
  onSubmitCurrent: () => void;
  onPrevious: () => void;
  onCancel: () => void;

  // UI state
  isProcessing: boolean;
  isKeyboardVisible: boolean;
  canSubmit: boolean;
}
```

**Sub-components to consider**:
- `QuickTrackPhotoCard.tsx` - Photo display and fullscreen
- `QuickTrackForm.tsx` - Form fields
- `QuickTrackProgressHeader.tsx` - Progress indicator

**Test**:
- Fill form
- Submit and move to next photo
- Navigate previous
- Test cancel

### Step 4.4: Extract Restaurant Processing Screen
**File**: `frontend/src/components/photos/steps/RestaurantProcessingScreen.tsx`

**Extract**: Lines ~2373-end of process screen (Restaurant processing)

**Props**:
```typescript
interface RestaurantProcessingScreenProps {
  // Photo data
  currentPhoto: PhotoToProcess;
  currentPhotoIndex: number;
  totalPhotos: number;

  // Restaurant state
  selectedRestaurant: Restaurant | null;
  restaurants: Restaurant[];
  restaurantSearchQuery: string;
  locationSearchQuery: string;
  onRestaurantSearchChange: (q: string) => void;
  onLocationSearchChange: (q: string) => void;
  onRestaurantSelected: (r: Restaurant | null) => void;

  // Menu item state
  selectedMenuItem: MenuItem | null;
  menuItems: MenuItem[];
  menuItemName: string;
  menuItemSearchQuery: string;
  menuItemSelectionMode: "search" | "scan" | "create";
  onMenuItemSelected: (item: MenuItem | null) => void;
  onMenuItemNameChange: (name: string) => void;
  onMenuItemSearchChange: (q: string) => void;
  onMenuItemModeChange: (mode: "search" | "scan" | "create") => void;

  // Rating & notes
  rating: number | null;
  notes: string;
  photoDate: Date;
  onRatingChange: (r: number | null) => void;
  onNotesChange: (notes: string) => void;
  onPhotoDateChange: (date: Date) => void;

  // Previous photo context
  previousRestaurant: Restaurant | null;
  processedPhotos: ProcessedPhoto[];

  // Actions
  onSubmitCurrent: () => void;
  onPrevious: () => void;
  onCancel: () => void;

  // UI state
  isProcessing: boolean;
  isKeyboardVisible: boolean;
  isOnline: boolean;
  canSubmit: boolean;

  // Mutations
  restaurantCreationMutation: any;
}
```

**Sub-components to extract**:
1. **`RestaurantPhotoCard.tsx`** - Photo display with fullscreen
2. **`MenuItemSelector.tsx`** - Menu item search/scan/create tabs
3. **`RestaurantProcessingForm.tsx`** - Restaurant + menu item + rating + notes
4. **`PhotoDatePicker.tsx`** - Date selection card
5. **`ProcessingProgressHeader.tsx`** - Progress indicator

**Test**:
- Select restaurant
- Select/create menu item
- Rate and add notes
- Submit and advance
- Test OCR scanning
- Test previous photo context

### Step 4.5: Extract Quick Track Review Screen
**File**: `frontend/src/components/photos/steps/QuickTrackReviewScreen.tsx`

**Extract**: Lines ~1640-1748 (Quick track review)

**Props**:
```typescript
interface QuickTrackReviewScreenProps {
  quickTrackPhotos: QuickTrackPhotoData[];
  onEdit: () => void;
  onSubmitAll: () => void;
  isSubmitting: boolean;
  isKeyboardVisible: boolean;
}
```

**Sub-component**:
- `QuickTrackReviewCard.tsx` - Individual item preview

**Test**:
- View review
- Edit items
- Submit all

### Step 4.6: Extract Restaurant Review Screen
**File**: `frontend/src/components/photos/steps/RestaurantReviewScreen.tsx`

**Extract**: Lines ~1751-1924 (Restaurant visit review)

**Props**:
```typescript
interface RestaurantReviewScreenProps {
  processedPhotos: ProcessedPhoto[];
  visitVisibility: "friends" | "private";
  onVisibilityChange: (v: "friends" | "private") => void;
  onEdit: () => void;
  onSubmitAll: () => void;
  isSubmitting: boolean;
  isKeyboardVisible: boolean;
}
```

**Sub-components**:
- `RestaurantVisitPreview.tsx` - Grouped by restaurant & date
- `RestaurantReviewCard.tsx` - Individual photo preview

**Test**:
- View grouped visits
- Change visibility
- Edit
- Submit all

---

## Phase 5: Create Main Orchestrator (3 hours)

### Step 5.1: Refactor ProcessPhotosPage as Orchestrator
**File**: `frontend/src/components/ProcessPhotosPage.tsx`

**New Structure** (~300 lines):
```typescript
export default function ProcessPhotosPage() {
  // Core hooks
  const navigate = useNavigate();
  const { isOnline } = useSync();
  const { handleError, showValidation } = useErrorHandler({...});

  // Screen navigation
  const [screen, setScreen] = useState<ScreenState>("choice");
  const [processType, setProcessType] = useState<ProcessType | null>(null);

  // Feature hooks
  const photoUpload = usePhotoUpload();
  const draftManagement = useDraftManagement();
  const restaurantProcessing = usePhotoProcessing();
  const quickTrackProcessing = useQuickTrackProcessing();
  const submission = usePhotoSubmission();

  // Data queries
  const { data: restaurants = [] } = useQuery<Restaurant[]>({...});
  const { data: menuItems = [] } = useQuery<MenuItem[]>({...});

  // Restaurant search state
  const [restaurantSearchQuery, setRestaurantSearchQuery] = useState("");
  const [locationSearchQuery, setLocationSearchQuery] = useState("");

  // Mutations
  const visitCreationMutation = useOfflineVisitCreation();
  const restaurantCreationMutation = useOfflineRestaurantCreation();
  const quickTrackMutation = useOfflineQuickTrack();

  // Load draft on mount
  useEffect(() => {
    draftManagement.loadDraft().then(draft => {
      if (draft) {
        // Restore state from draft
      }
    });
  }, []);

  // Screen-specific handlers
  const handleChooseProcessType = (type: ProcessType) => {
    setProcessType(type);
    setScreen("upload");
  };

  const handlePhotosUploaded = async (files: FileList) => {
    await photoUpload.handlePhotoSelect(files);
    setScreen("process");
  };

  const handleSubmitCurrent = async () => {
    if (processType === "restaurant") {
      await restaurantProcessing.handleSubmitCurrent(
        photoUpload.photos[photoUpload.currentPhotoIndex]
      );
    } else {
      await quickTrackProcessing.handleSubmitCurrent(
        photoUpload.photos[photoUpload.currentPhotoIndex]
      );
    }

    // Move to next or review
    if (photoUpload.currentPhotoIndex < photoUpload.photos.length - 1) {
      photoUpload.setCurrentPhotoIndex(photoUpload.currentPhotoIndex + 1);
    } else {
      setScreen("review");
    }
  };

  const handleSubmitAll = async () => {
    if (processType === "restaurant") {
      await submission.submitRestaurantVisits(
        restaurantProcessing.processedPhotos,
        restaurantProcessing.visitVisibility
      );
    } else {
      await submission.submitQuickTrackItems(
        quickTrackProcessing.quickTrackPhotos
      );
    }

    await draftManagement.clearDraft();
    navigate({ to: "/home" });
  };

  // Render screens based on state
  if (screen === "choice") {
    return <ChoiceScreen onSelectType={handleChooseProcessType} />;
  }

  if (screen === "upload") {
    return (
      <UploadScreen
        processType={processType!}
        onPhotosSelected={handlePhotosUploaded}
        onBack={() => setScreen("choice")}
        isRestoringData={draftManagement.isRestoringData}
      />
    );
  }

  if (screen === "process") {
    const currentPhoto = photoUpload.photos[photoUpload.currentPhotoIndex];

    if (processType === "quickTrack") {
      return (
        <QuickTrackProcessingScreen
          currentPhoto={currentPhoto}
          currentPhotoIndex={photoUpload.currentPhotoIndex}
          totalPhotos={photoUpload.photos.length}
          {...quickTrackProcessing}
          onSubmitCurrent={handleSubmitCurrent}
          onPrevious={() => photoUpload.setCurrentPhotoIndex(
            photoUpload.currentPhotoIndex - 1
          )}
          onCancel={() => {/* ... */}}
          isProcessing={submission.isSubmitting}
          canSubmit={quickTrackProcessing.canSubmitCurrent}
        />
      );
    }

    return (
      <RestaurantProcessingScreen
        currentPhoto={currentPhoto}
        currentPhotoIndex={photoUpload.currentPhotoIndex}
        totalPhotos={photoUpload.photos.length}
        restaurants={restaurants}
        menuItems={menuItems}
        restaurantSearchQuery={restaurantSearchQuery}
        locationSearchQuery={locationSearchQuery}
        onRestaurantSearchChange={setRestaurantSearchQuery}
        onLocationSearchChange={setLocationSearchQuery}
        {...restaurantProcessing}
        onSubmitCurrent={handleSubmitCurrent}
        onPrevious={() => photoUpload.setCurrentPhotoIndex(
          photoUpload.currentPhotoIndex - 1
        )}
        onCancel={() => {/* ... */}}
        isProcessing={submission.isSubmitting}
        canSubmit={restaurantProcessing.canSubmitCurrent}
        restaurantCreationMutation={restaurantCreationMutation}
      />
    );
  }

  if (screen === "review") {
    if (processType === "quickTrack") {
      return (
        <QuickTrackReviewScreen
          quickTrackPhotos={quickTrackProcessing.quickTrackPhotos}
          onEdit={() => setScreen("process")}
          onSubmitAll={handleSubmitAll}
          isSubmitting={submission.isSubmitting}
        />
      );
    }

    return (
      <RestaurantReviewScreen
        processedPhotos={restaurantProcessing.processedPhotos}
        visitVisibility={restaurantProcessing.visitVisibility}
        onVisibilityChange={restaurantProcessing.setVisitVisibility}
        onEdit={() => setScreen("process")}
        onSubmitAll={handleSubmitAll}
        isSubmitting={submission.isSubmitting}
      />
    );
  }

  return null;
}
```

**Test**: Full end-to-end workflow for both modes

---

## Phase 6: Testing & Refinement (4 hours)

### Step 6.1: Create Component Tests
For each major component:
- Unit tests for isolated logic
- Integration tests for user flows
- Visual regression tests (optional)

### Step 6.2: E2E Testing
Update Cypress tests:
- Test restaurant visit flow
- Test quick track flow
- Test draft persistence
- Test offline mode
- Test error handling

### Step 6.3: Performance Testing
- Verify no performance regression
- Check bundle size
- Test with large photo sets (10+ photos)

### Step 6.4: Accessibility Testing
- Keyboard navigation
- Screen reader compatibility
- Focus management

---

## Phase 7: Cleanup & Documentation (2 hours)

### Step 7.1: Remove Old File
- Delete original ProcessPhotosPage.tsx once all tests pass
- Verify all imports are updated

### Step 7.2: Update Documentation
- Add JSDoc comments to all components
- Update CLAUDE.md if needed
- Create component usage examples

### Step 7.3: Update TODO List
- Mark Phase 3 as complete in TODOS.md
- Document any follow-up improvements

---

## Migration Strategy

**Approach**: Parallel development with feature flag

1. Create all new components in `components/photos/` directory
2. Keep old ProcessPhotosPage.tsx working
3. Once all new components are ready and tested:
   - Replace old component content with new orchestrator
   - Run full test suite
   - Deploy

**Rollback Plan**:
- Git branch for refactoring
- Can revert commit if issues found
- Old code preserved in git history

---

## File Structure After Refactoring

```
frontend/src/
├── components/
│   ├── ProcessPhotosPage.tsx (300 lines - orchestrator)
│   └── photos/
│       ├── restaurant/
│       │   ├── RestaurantSelector.tsx
│       │   ├── RestaurantPhotoCard.tsx
│       │   ├── MenuItemSelector.tsx
│       │   └── RestaurantReviewCard.tsx
│       ├── quicktrack/
│       │   ├── QuickTrackPhotoCard.tsx
│       │   ├── QuickTrackForm.tsx
│       │   └── QuickTrackReviewCard.tsx
│       └── steps/
│           ├── ChoiceScreen.tsx
│           ├── UploadScreen.tsx
│           ├── QuickTrackProcessingScreen.tsx
│           ├── RestaurantProcessingScreen.tsx
│           ├── QuickTrackReviewScreen.tsx
│           └── RestaurantReviewScreen.tsx
├── hooks/
│   └── photos/
│       ├── usePhotoUpload.ts
│       ├── usePhotoProcessing.ts
│       ├── useQuickTrackProcessing.ts
│       ├── useDraftManagement.ts
│       └── usePhotoSubmission.ts
├── types/
│   └── photos.ts
└── lib/
    └── photoUtils.ts
```

---

## Estimated Timeline

| Phase | Task | Hours | Cumulative |
|-------|------|-------|------------|
| 0 | Pre-refactoring setup | 1 | 1 |
| 1 | Extract utilities & helpers | 2 | 3 |
| 2 | Extract RestaurantSelector | 4 | 7 |
| 3 | Extract custom hooks | 6 | 13 |
| 4 | Extract screen components | 12 | 25 |
| 5 | Create main orchestrator | 3 | 28 |
| 6 | Testing & refinement | 4 | 32 |
| 7 | Cleanup & documentation | 2 | 34 |

**Total: ~34 hours** (vs original estimate of 24 hours - more realistic with testing)

---

## Success Criteria

- [ ] All E2E tests pass
- [ ] No functionality lost
- [ ] Main component < 400 lines
- [ ] Individual components < 300 lines each
- [ ] All hooks have clear, single responsibilities
- [ ] TypeScript compilation with no errors
- [ ] Draft persistence works correctly
- [ ] Both restaurant and quick track modes work
- [ ] Offline mode works
- [ ] No performance regressions

---

## Notes & Considerations

1. **State Management**: Consider using `useReducer` instead of multiple `useState` calls in hooks if state becomes too complex

2. **Context API**: If prop drilling becomes excessive in screen components, consider creating a `PhotoProcessingContext`

3. **Form Libraries**: The menu item selection could potentially use TanStack Form for better validation

4. **OCR Integration**: The `useMenuOCR` hook is already extracted - good example to follow

5. **Error Handling**: The `useErrorHandler` hook is already being used - maintain this pattern

6. **Draft Service**: The `processPhotosDraftService` is critical - be careful with changes that affect persistence

7. **Mobile Keyboard**: The `useKeyboardVisible` hook handles keyboard detection - maintain this for better UX

---

## Questions to Clarify Before Starting

1. Do you want to refactor the `RestaurantSelector` sub-components immediately or defer to later?
2. Should we use `useReducer` for complex state management in hooks?
3. Do you want to add any new features during the refactor (e.g., better photo editing)?
4. Should we create a context for photo processing state or keep prop drilling?
5. Any specific testing coverage requirements?

---

## Ready to Start?

This plan breaks down the refactoring into small, testable increments. Each step can be completed and tested independently.

**Recommended starting point**: Phase 0 → Phase 1 → Phase 2, then reassess before continuing.

Would you like me to help you execute this plan step by step?

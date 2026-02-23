# Component Organization Guide

This guide defines the structure and organization of components in the Yummy Recs application.

## Directory Structure

```
src/
├── routes/                    # TanStack Router route files (pages)
│   ├── __root.tsx            # Root layout
│   ├── index.tsx             # Login page (/)
│   ├── home.tsx              # Home page (/home)
│   ├── signup.tsx            # Signup page
│   └── profile.tsx           # Profile page
│
├── components/               # React components
│   ├── ui/                   # Reusable UI components (shadcn/ui + custom)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── DeleteConfirmationDialog.tsx
│   │   ├── LoadingState.tsx
│   │   └── ErrorState.tsx
│   │
│   ├── home/                 # Home page specific components
│   │   ├── HomePage.tsx      # Main page component (used in routes/home.tsx)
│   │   ├── VisitCard.tsx
│   │   ├── QuickTrackCard.tsx
│   │   └── VisitListHeader.tsx
│   │
│   ├── visits/               # Visit-related components
│   │   ├── add/              # Add visit flow
│   │   ├── edit/             # Edit visit flow
│   │   └── shared/           # Shared visit components
│   │
│   ├── auth/                 # Authentication components
│   │   ├── LoginPage.tsx
│   │   ├── SignUpPage.tsx
│   │   └── ForgotPasswordPage.tsx
│   │
│   ├── profile/              # Profile-related components
│   │   ├── ProfilePage.tsx
│   │   └── FriendsPage.tsx
│   │
│   ├── photos/               # Photo processing components
│   ├── lists/                # Restaurant lists components
│   ├── bills/                # Bill splitting components
│   ├── settings/             # Settings components
│   ├── quick-track/          # Quick track components
│   └── shared/               # Globally shared components
│       ├── BottomTabNavigation.tsx
│       ├── ShareCustomizationModal.tsx
│       └── WhatsNewDialog.tsx
│
├── hooks/                    # Custom React hooks
│   ├── api/                  # API query hooks
│   ├── offline/              # Offline-aware mutation hooks
│   ├── ui/                   # UI-related hooks
│   ├── visits/               # Visit-specific hooks
│   └── photos/               # Photo-specific hooks
│
├── lib/                      # Utilities and libraries
│   ├── pocketbase.ts         # PocketBase client setup
│   ├── logger.ts             # Logging utility
│   ├── syncQueue.ts          # Offline sync queue
│   └── dateUtils.ts          # Date utilities
│
├── services/                 # Business logic services
│   ├── ocrService.ts
│   ├── photoService.ts
│   └── draftServiceFactory.ts
│
└── constants/                # Application constants
    ├── collections.ts
    └── queryKeys.ts
```

## Component Classification

### 1. Page Components

**Location:** `src/routes/*.tsx` OR `src/components/{feature}/*Page.tsx`

**Purpose:** Top-level components that represent entire pages/routes

**Characteristics:**
- Rendered by TanStack Router
- Handle route-level data fetching
- Manage page-level state
- Compose smaller components

**Examples:**
- `routes/home.tsx` - Uses `HomePage.tsx`
- `components/auth/LoginPage.tsx`
- `components/profile/ProfilePage.tsx`

**Note:** Some page components are in `components/` due to the current architecture. Future refactoring could move them to `routes/`, but this is not critical.

### 2. Feature Components

**Location:** `src/components/{feature}/`

**Purpose:** Components specific to a feature domain

**Characteristics:**
- Used within a specific feature area
- May have complex business logic
- Often use feature-specific hooks

**Examples:**
- `components/visits/add/SelectRestaurantPage.tsx`
- `components/bills/BillDetailView.tsx`
- `components/photos/ProcessPhotosPage.tsx`

### 3. Shared Components

**Location:** `src/components/shared/`

**Purpose:** Components used across multiple features

**Characteristics:**
- Reusable across different pages
- General-purpose functionality
- Should be well-documented

**Examples:**
- `components/shared/BottomTabNavigation.tsx`
- `components/shared/ShareCustomizationModal.tsx`
- `components/shared/QRScanner.tsx`

### 4. UI Components

**Location:** `src/components/ui/`

**Purpose:** Presentational components with no business logic

**Characteristics:**
- Purely presentational
- Reusable across the entire app
- Well-typed props
- No direct data fetching
- Includes shadcn/ui components

**Examples:**
- `components/ui/button.tsx`
- `components/ui/DeleteConfirmationDialog.tsx`
- `components/ui/LoadingState.tsx`
- `components/ui/ErrorState.tsx`

## Naming Conventions

### Component Files

```typescript
// ✅ Good - PascalCase for components
ComponentName.tsx
HomePage.tsx
VisitCard.tsx

// ❌ Bad
component-name.tsx
homePage.tsx
visit_card.tsx
```

### Component Exports

```typescript
// ✅ Good - Named export for components
export function ComponentName() { }
export default function PageName() { } // Pages can use default export

// ✅ Good - For UI components
export const Button = React.forwardRef<...>({ })
```

### File Organization

```typescript
// ✅ Good - One main component per file
// ComponentName.tsx
import { ... } from '...';

interface ComponentNameProps {
  // Props
}

export function ComponentName({ ... }: ComponentNameProps) {
  // Implementation
}

// ❌ Bad - Multiple unrelated components
// components.tsx
export function ComponentA() { }
export function ComponentB() { }
export function ComponentC() { }
```

## Component Patterns

### 1. Page Components

```typescript
// routes/feature.tsx or components/feature/FeaturePage.tsx
export default function FeaturePage() {
  // 1. Hooks
  const navigate = useNavigate();
  const { data, isLoading } = useQuery(...);
  const mutation = useMutation(...);
  const { error, handleError } = useErrorHandler({ source: 'FeaturePage' });

  // 2. Derived state
  const filteredData = useMemo(() => ..., [data]);

  // 3. Event handlers
  const handleSubmit = useCallback(() => ..., []);

  // 4. Effects
  useEffect(() => ..., []);

  // 5. Early returns
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;

  // 6. Render
  return (
    <div>
      <FeatureComponent data={filteredData} onSubmit={handleSubmit} />
    </div>
  );
}
```

### 2. Feature Components

```typescript
// components/feature/FeatureComponent.tsx
interface FeatureComponentProps {
  data: Data[];
  onAction: (id: string) => void;
}

export function FeatureComponent({ data, onAction }: FeatureComponentProps) {
  // Local UI state only
  const [isOpen, setIsOpen] = useState(false);

  // Delegate business logic to parent
  // Focus on presentation

  return (
    <Card>
      {data.map(item => (
        <FeatureItem key={item.id} item={item} onAction={onAction} />
      ))}
    </Card>
  );
}
```

### 3. UI Components

```typescript
// components/ui/ComponentName.tsx
interface ComponentNameProps {
  variant?: 'default' | 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
}

/**
 * Reusable ComponentName
 *
 * @example
 * ```tsx
 * <ComponentName variant="primary" size="lg">
 *   Click me
 * </ComponentName>
 * ```
 */
export function ComponentName({
  variant = 'default',
  size = 'md',
  children,
  onClick,
}: ComponentNameProps) {
  return (
    <button
      className={cn(baseStyles, variantStyles[variant], sizeStyles[size])}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
```

## Best Practices

### ✅ DO

1. **Keep components focused** - One responsibility per component
2. **Use proper typing** - Define interfaces for all props
3. **Document complex components** - Add JSDoc comments with examples
4. **Extract reusable logic** - Use custom hooks for shared logic
5. **Memoize expensive operations** - Use `useMemo` and `useCallback`
6. **Handle loading and error states** - Use `LoadingState` and `ErrorState` components
7. **Use consistent file structure** - Follow the patterns above
8. **Collocate related files** - Keep components with their hooks and utilities

### ❌ DON'T

1. **Don't mix page and UI logic** - Separate concerns
2. **Don't create mega-components** - Split into smaller pieces
3. **Don't duplicate code** - Extract common patterns
4. **Don't inline complex logic** - Extract to functions or hooks
5. **Don't forget error handling** - Always handle errors gracefully
6. **Don't ignore performance** - Profile and optimize when needed
7. **Don't skip types** - Never use `any` without good reason

## Component Composition

### Container/Presentational Pattern

```typescript
// Container (Smart Component) - handles data and logic
function VisitListContainer() {
  const { data: visits, isLoading } = useVisits();
  const deleteMutation = useOfflineDelete();

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id);
  }, [deleteMutation]);

  if (isLoading) return <LoadingState />;

  return <VisitList visits={visits} onDelete={handleDelete} />;
}

// Presentational (Dumb Component) - pure UI
interface VisitListProps {
  visits: Visit[];
  onDelete: (id: string) => void;
}

function VisitList({ visits, onDelete }: VisitListProps) {
  return (
    <div>
      {visits.map(visit => (
        <VisitCard key={visit.id} visit={visit} onDelete={() => onDelete(visit.id)} />
      ))}
    </div>
  );
}
```

### Compound Components Pattern

```typescript
// For complex, configurable components
function Card({ children }: { children: React.ReactNode }) {
  return <div className="card">{children}</div>;
}

Card.Header = function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="card-header">{children}</div>;
};

Card.Body = function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="card-body">{children}</div>;
};

// Usage
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
</Card>
```

## Migration Guide

### Moving Components

When moving a component:

1. Update imports in all files that use it
2. Update the component's own imports
3. Run TypeScript check: `npm run build`
4. Search for old import path: `grep -r "old/path" src/`
5. Test affected pages

### Refactoring Large Components

When a component exceeds ~300 lines:

1. **Identify sections** - What can be extracted?
2. **Extract UI sections** - Create presentational sub-components
3. **Extract logic** - Move to custom hooks
4. **Extract handlers** - Group related event handlers
5. **Test thoroughly** - Ensure behavior unchanged

## Examples from Codebase

### Well-Organized Features

✅ **Visits Feature** - Good separation
```
components/visits/
├── add/              # Add visit flow
│   ├── SelectRestaurantPage.tsx
│   ├── AddItemsToVisit.tsx
│   └── RateItemsPage.tsx
├── edit/             # Edit visit flow
│   ├── EditItemsPage.tsx
│   └── EditRateItemsPage.tsx
└── shared/           # Shared components
    ├── VisitCard.tsx
    └── MenuItemCard.tsx
```

✅ **UI Components** - Reusable and well-typed
```
components/ui/
├── button.tsx
├── card.tsx
├── DeleteConfirmationDialog.tsx   # New!
├── LoadingState.tsx                # New!
└── ErrorState.tsx                  # New!
```

## Checklist for New Components

- [ ] Component is in the correct directory
- [ ] File name follows PascalCase convention
- [ ] Props are properly typed with interface
- [ ] Component has JSDoc comment if complex
- [ ] Loading and error states are handled
- [ ] Expensive operations are memoized
- [ ] Component is tested (if critical)
- [ ] No console.log statements (use logger)
- [ ] Uses centralized constants (COLLECTIONS, queryKeys)
- [ ] Follows existing patterns in the codebase

## Resources

- [React Component Patterns](https://react.dev/learn/thinking-in-react)
- [TanStack Router File-Based Routing](https://tanstack.com/router/latest/docs/framework/react/guide/file-based-routing)
- [shadcn/ui Component Structure](https://ui.shadcn.com/docs)

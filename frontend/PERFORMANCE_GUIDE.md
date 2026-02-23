# Performance Optimization Guide

This guide covers performance best practices for the Yummy Recs application.

## React Performance Patterns

### 1. Memoization with `useMemo`

Use `useMemo` for expensive computations that depend on specific values:

```typescript
// ✅ Good - Memoized expensive filter/map
const filteredVisits = useMemo(() => {
  return visits.filter(v => v.restaurant === selectedRestaurant)
               .map(v => transformVisit(v));
}, [visits, selectedRestaurant]);

// ❌ Bad - Recomputed on every render
const filteredVisits = visits.filter(v => v.restaurant === selectedRestaurant)
                             .map(v => transformVisit(v));
```

### 2. Callback Memoization with `useCallback`

Use `useCallback` for functions passed as props to prevent child re-renders:

```typescript
// ✅ Good - Memoized callback
const handleDelete = useCallback((id: string) => {
  deleteVisit(id);
}, [deleteVisit]);

// ❌ Bad - New function on every render
const handleDelete = (id: string) => {
  deleteVisit(id);
};
```

### 3. Map-based Lookups for O(1) Performance

Convert arrays to Maps for fast lookups:

```typescript
// ✅ Good - O(1) lookup
const restaurantMap = useMemo(
  () => new Map(restaurants.map(r => [r.id, r])),
  [restaurants]
);
const restaurant = restaurantMap.get(visitrestaurant); // O(1)

// ❌ Bad - O(n) lookup
const restaurant = restaurants.find(r => r.id === visit.restaurant); // O(n)
```

### 4. Avoid Nested Loops in Render

```typescript
// ✅ Good - Pre-group data
const visitsByRestaurant = useMemo(() => {
  const map = new Map<string, Visit[]>();
  visits.forEach(v => {
    const list = map.get(v.restaurant) || [];
    list.push(v);
    map.set(v.restaurant, list);
  });
  return map;
}, [visits]);

// ❌ Bad - O(n²) in render
{restaurants.map(r => (
  <div key={r.id}>
    {visits.filter(v => v.restaurant === r.id).map(...)} // Nested loop!
  </div>
))}
```

## Query Optimization

### 1. Use Selective Queries

```typescript
// ✅ Good - Only fetch what you need
const { data: visit } = useQuery({
  queryKey: ['visit', id],
  queryFn: () => pb.collection('visits').getOne(id, {
    expand: 'restaurant', // Only expand what you use
  }),
  enabled: !!id, // Don't fetch without ID
});

// ❌ Bad - Over-fetching
const { data: visits } = useQuery({
  queryKey: ['visits'],
  queryFn: () => pb.collection('visits').getFullList({
    expand: 'restaurant,food_items,user,photos', // Too much!
  }),
});
```

### 2. Pagination for Large Lists

```typescript
// ✅ Good - Paginated
const { data } = useInfiniteQuery({
  queryKey: ['visits', 'paginated'],
  queryFn: ({ pageParam = 1 }) =>
    pb.collection('visits').getList(pageParam, 20),
  getNextPageParam: (lastPage) => lastPage.page + 1,
});

// ❌ Bad - Load everything
const { data } = useQuery({
  queryKey: ['visits'],
  queryFn: () => pb.collection('visits').getFullList(),
});
```

## Component Optimization

### 1. React.memo for Pure Components

Wrap components that re-render unnecessarily:

```typescript
// ✅ Good - Memoized component
export const VisitCard = React.memo(({ visit, onDelete }: Props) => {
  return <Card>...</Card>;
});

// For complex props comparison
export const VisitCard = React.memo(
  ({ visit, onDelete }: Props) => {
    return <Card>...</Card>;
  },
  (prevProps, nextProps) => {
    return prevProps.visit.id === nextProps.visit.id &&
           prevProps.visit.updated === nextProps.visit.updated;
  }
);
```

### 2. Code Splitting with Lazy Loading

```typescript
// ✅ Good - Lazy load heavy components
const AdminPanel = lazy(() => import('@/components/admin/AdminPanel'));

function App() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AdminPanel />
    </Suspense>
  );
}
```

### 3. Virtualization for Long Lists

For lists with 100+ items, use virtualization:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function VisitList({ visits }: { visits: Visit[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: visits.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Estimated item height
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <VisitCard visit={visits[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Image Optimization

### 1. Lazy Load Images

```typescript
// ✅ Good - Native lazy loading
<img src={url} loading="lazy" alt="..." />

// Or with Intersection Observer for better control
const [isVisible, setIsVisible] = useState(false);
const imgRef = useRef<HTMLImageElement>(null);

useEffect(() => {
  const observer = new IntersectionObserver(
    ([entry]) => entry.isIntersecting && setIsVisible(true)
  );
  if (imgRef.current) observer.observe(imgRef.current);
  return () => observer.disconnect();
}, []);
```

### 2. Responsive Images

```typescript
// ✅ Good - Serve appropriate sizes
<img
  srcSet={`
    ${thumbUrl} 300w,
    ${mediumUrl} 600w,
    ${largeUrl} 1200w
  `}
  sizes="(max-width: 768px) 100vw, 50vw"
  src={mediumUrl}
  alt="..."
/>
```

## State Management

### 1. Minimize Re-renders with Atomic State

```typescript
// ✅ Good - Separate state
const [name, setName] = useState('');
const [email, setEmail] = useState('');

// ❌ Bad - Causes unnecessary re-renders
const [form, setForm] = useState({ name: '', email: '' });
setForm({ ...form, name: newName }); // Re-renders even if email didn't change
```

### 2. Use Query Client Cache Wisely

```typescript
// ✅ Good - Read from cache without refetch
const visit = queryClient.getQueryData(['visit', id]);

// ❌ Bad - Triggers network request
const { data: visit } = useQuery({
  queryKey: ['visit', id],
  queryFn: () => pb.collection('visits').getOne(id),
});
```

## Common Performance Pitfalls

### ❌ Inline Object/Array Creation in JSX

```typescript
// Bad - Creates new object on every render
<Component style={{ margin: 10 }} data={[1, 2, 3]} />

// Good - Memoize or move outside component
const style = { margin: 10 };
const data = [1, 2, 3];
<Component style={style} data={data} />
```

### ❌ Unnecessary Dependencies

```typescript
// Bad - Re-runs when anything changes
useEffect(() => {
  doSomething(a, b, c);
}, [a, b, c, unnecessaryDep]);

// Good - Only necessary deps
useEffect(() => {
  doSomething(a, b, c);
}, [a, b, c]);
```

### ❌ Large Bundle Size

```typescript
// Bad - Imports entire library
import _ from 'lodash';

// Good - Import only what you need
import debounce from 'lodash/debounce';
```

## Performance Monitoring

### Using React DevTools Profiler

1. Install React DevTools browser extension
2. Open Components tab > Profiler
3. Click "Start Profiling"
4. Interact with your app
5. Click "Stop Profiling"
6. Analyze flame graph for slow renders

### Key Metrics to Watch

- **Component render time** - Should be < 16ms for 60fps
- **Number of renders** - Minimize unnecessary re-renders
- **Bundle size** - Keep chunks < 500KB
- **Time to Interactive** - Should be < 3s on mobile

## Application-Specific Optimizations

### HomePage Optimizations (Already Implemented)

```typescript
// Map-based lookups
const restaurantMap = useMemo(() =>
  new Map(restaurants.map(r => [r.id, r])),
  [restaurants]
);

// Grouped data
const foodItemsByVisit = useMemo(() => {
  const map = new Map<string, FoodItem[]>();
  foodItems.forEach(item => {
    const items = map.get(item.visit) || [];
    items.push(item);
    map.set(item.visit, items);
  });
  return map;
}, [foodItems]);
```

### Custom Hooks for Heavy Logic

Extract expensive logic into custom hooks with proper memoization:

```typescript
// hooks/visits/useVisitFilters.ts
export function useVisitFilters(visits: Visit[], filters: Filters) {
  return useMemo(() => {
    return visits.filter(v => {
      // Complex filtering logic
    });
  }, [visits, filters]);
}
```

## Checklist for New Components

- [ ] Are expensive computations wrapped in `useMemo`?
- [ ] Are callbacks passed to children wrapped in `useCallback`?
- [ ] Are large lists virtualized (if > 100 items)?
- [ ] Are images lazy loaded?
- [ ] Is the component wrapped in `React.memo` if it's purely presentational?
- [ ] Are array lookups converted to Map lookups (if done frequently)?
- [ ] Is the bundle size impact acceptable (< 50KB for new code)?
- [ ] Does the component render in < 16ms?

## Resources

- [React Performance Optimization](https://react.dev/learn/render-and-commit)
- [TanStack Query Performance](https://tanstack.com/query/latest/docs/react/guides/performance)
- [Web Vitals](https://web.dev/vitals/)

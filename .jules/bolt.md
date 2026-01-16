## 2024-05-22 - [React.memo vs Inline Functions]
**Learning:** `React.memo` on list items (`VisitCard`) was ineffective because the parent (`HomePage`) passed inline arrow functions as props (`onMoveItem`, `onEdit`, etc.). This caused all list items to re-render whenever the parent re-rendered, negating the memoization.
**Action:** Always wrap callback props in `useCallback` when passing them to memoized components. Check for inline functions in JSX when auditing performance.

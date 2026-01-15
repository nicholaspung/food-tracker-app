## 2024-05-23 - [Optimization] N+1 Query in Lists
**Learning:** React Query `queryFn` loops performing individual API calls are silent performance killers. Batching IDs into a single `OR` filter (`list='id1' || list='id2'`) significantly reduces network overhead.
**Action:** Always check `useQuery` functions for loops over array data triggering recursive fetches. Use batched `getFullList` with `filter` instead.

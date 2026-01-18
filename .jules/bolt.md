## 2024-05-23 - [Optimization] N+1 Query in Lists
**Learning:** React Query `queryFn` loops performing individual API calls are silent performance killers. Batching IDs into a single `OR` filter (`list='id1' || list='id2'`) significantly reduces network overhead.
**Action:** Always check `useQuery` functions for loops over array data triggering recursive fetches. Use batched `getFullList` with `filter` instead.
## 2024-05-22 - [Batched PocketBase Queries]
**Learning:** PocketBase N+1 queries can be solved by batching requests using `filter` with OR conditions (`list='id1' || list='id2'`) combined with `fields` parameter to minimize payload.
**Action:** When fetching aggregate data (like counts) for a list of items, always prefer a single batched query over iterating and fetching individually. Chunk the requests (e.g., 50 items) to avoid URL length limits.

## 2024-05-22 - [Batched PocketBase Queries]
**Learning:** PocketBase N+1 queries can be solved by batching requests using `filter` with OR conditions (`list='id1' || list='id2'`) combined with `fields` parameter to minimize payload.
**Action:** When fetching aggregate data (like counts) for a list of items, always prefer a single batched query over iterating and fetching individually. Chunk the requests (e.g., 50 items) to avoid URL length limits.

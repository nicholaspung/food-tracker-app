# Default Restaurant List Is Want to Try

Each user has one system-managed default Restaurant List. Its user-facing name is **Want to Try**.

The **Want to Try** list is the only Restaurant List that can accept simple restaurant bookmarks without a food-item recommendation. It can also hold recommendation or menu-item bookmarks copied from friend/shared list flows. User-created Restaurant Lists remain curated recommendation lists and continue to require the existing recommendation/list-item shape unless a later decision changes that.

Users can add bookmarks to **Want to Try**, but they cannot delete it or manually edit its name, description, visibility, or other list metadata through the normal curated-list editing controls. Normal user-created Restaurant Lists keep the existing edit, delete, sharing, and curated recommendation behavior.

New backend-created default lists should be seeded as `Want to Try` with description `Restaurants and recommendations you want to try later`. Existing default lists named `Saved` should be backfilled to `Want to Try`; non-default lists named `Saved` or names manually chosen by users should not be renamed by this decision.

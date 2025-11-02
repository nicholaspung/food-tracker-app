# Restaurant Lists Feature Implementation Plan

## Executive Summary

Add user-created lists/collections of restaurants (e.g., "Best Pizza in Town", "Date Night Spots", "Must Try") with visibility controls, sharing capabilities, and discovery features. This enhances the social aspect of the app and helps users organize and share their dining experiences.

---

## Current State Analysis

### Existing Features
- Restaurants with visibility controls (from deduplication plan)
- Visits with visibility settings (friends/private)
- User friendships system
- Food items and ratings

### Integration Points
- Lists will reference existing restaurants
- Lists will have similar visibility controls (private/friends/public)
- Lists can be discovered through friends' profiles
- Lists complement the existing restaurant browsing experience

---

## Phase 1: Core List Management

### 1.1 Database Schema

**New Collection: `restaurant_lists`**
```
Fields:
- name (text, required, max 100 chars) - "Best Pizza Spots"
- description (text, optional, max 500 chars) - User's note about the list
- visibility (select: "private", "friends", "public", default: "private")
- user (relation to users, required) - List owner
- created (autodate)
- updated (autodate)
- coverImage (file, optional) - Optional cover photo for the list
- isCollaborative (bool, default: false) - Future: allow multiple editors
```

**Collection Rules:**
```
ListRule:
  visibility = 'public' ||
  user = @request.auth.id ||
  (visibility = 'friends' && (
    (@collection.friendships.user.id ?= user &&
     @collection.friendships.friend.id ?= @request.auth.id &&
     @collection.friendships.status ?= 'accepted') ||
    (@collection.friendships.user.id ?= @request.auth.id &&
     @collection.friendships.friend.id ?= user &&
     @collection.friendships.status ?= 'accepted')
  ))

ViewRule: [same as ListRule]
CreateRule: "@request.auth.id != ''"
UpdateRule: "user = @request.auth.id"
DeleteRule: "user = @request.auth.id"
```

**New Collection: `list_items`**
```
Fields:
- list (relation to restaurant_lists, required, cascade delete)
- restaurant (relation to restaurants, required)
- addedBy (relation to users, required) - Who added this restaurant
- position (number, required) - For manual ordering
- note (text, optional, max 300 chars) - Personal note about why it's on the list
- created (autodate)
```

**Unique Index:** (list, restaurant) - Prevent duplicate entries in same list

**Collection Rules:**
```
ListRule: Inherits from parent list's visibility
ViewRule: Same as ListRule
CreateRule:
  @request.auth.id != '' &&
  @collection.restaurant_lists.id = list &&
  @collection.restaurant_lists.user = @request.auth.id

UpdateRule:
  addedBy = @request.auth.id ||
  @collection.restaurant_lists.user = @request.auth.id

DeleteRule: Same as UpdateRule
```

### 1.2 Core Features

**List Creation:**
- Name (required)
- Description (optional)
- Visibility selector (default: private)
- Optional cover image

**List Management:**
- Add/remove restaurants
- Reorder items (drag-and-drop on mobile)
- Add personal notes to each list item
- Edit list metadata (name, description, visibility)
- Delete entire list

**List Discovery:**
- "My Lists" tab on profile page
- "Friends' Lists" feed showing public/friends lists
- List previews showing first 3-4 restaurants with cover images

### 1.3 Frontend Components

**New Pages:**
- `/lists` - Browse all user's lists + discover friends' lists
- `/lists/create` - Create new list
- `/lists/$listId` - View list detail (scrollable restaurant cards)
- `/lists/$listId/edit` - Edit list metadata

**New Components:**
- `ListCard.tsx` - Preview card showing list name, cover, item count
- `ListDetailPage.tsx` - Full list view with all restaurants
- `CreateListModal.tsx` - Quick create modal (alternative to full page)
- `AddToListButton.tsx` - Button on restaurant detail page
- `AddToListModal.tsx` - Select which list(s) to add restaurant to
- `ListItemCard.tsx` - Restaurant card within a list (shows position, note)
- `ReorderListItems.tsx` - Drag-and-drop reordering interface

**UI/UX Patterns (Mobile-First):**
- Bottom sheet modal for "Add to List" action
- Swipe-to-delete on list items
- Long-press to enter reorder mode
- Pull-to-refresh on lists browse page
- Empty state: "Create your first list to organize your favorite spots!"

### 1.4 Implementation Order

1. Create database collections (`restaurant_lists`, `list_items`)
2. Create list CRUD endpoints (PocketBase auto-generates these)
3. Build `CreateListModal` and list creation flow
4. Build `ListDetailPage` to view list contents
5. Add "Add to List" button on restaurant detail page
6. Implement `AddToListModal` for selecting target lists
7. Add list management (edit, delete, reorder)
8. Create lists browse page (`/lists`)
9. Add lists section to user profile page

---

## Phase 2: Social Discovery & Sharing

### 2.1 Discovery Features

**Friends' Lists Feed:**
- Show public/friends lists from friends on `/lists` page
- Filter: "My Lists" / "Friends' Lists" / "Public Lists"
- Sort: "Recently Updated" / "Most Popular" / "Alphabetical"

**List Popularity Metrics:**
Add to `restaurant_lists` collection:
- `followerCount` (number, default: 0)
- `viewCount` (number, default: 0)

**New Collection: `list_follows`**
```
Fields:
- list (relation to restaurant_lists, required)
- user (relation to users, required)
- created (autodate)
```

**Unique Index:** (list, user)

**Follow Features:**
- Follow button on public/friends lists
- "Followed Lists" tab in lists browse page
- Notification when followed list is updated (Phase 3)

### 2.2 Sharing & Links

**Shareable List Links:**
- Generate shareable link: `/lists/share/$listId`
- Anyone with link can view (if list is public/friends)
- Share button with native mobile share sheet

**Embed Preview (Meta Tags):**
- When sharing list URL, show rich preview with:
  - List name
  - Description
  - Cover image or first restaurant photo
  - Item count (e.g., "12 restaurants")

### 2.3 Implementation Order

1. Create `list_follows` collection
2. Add follow/unfollow functionality
3. Build "Friends' Lists" feed with filtering
4. Implement list popularity metrics (view/follower counts)
5. Add shareable links with meta tags
6. Integrate native mobile share functionality

---

## Phase 3: Advanced Features

### 3.1 Collaborative Lists

**Schema Changes:**
Add to `restaurant_lists`:
- `isCollaborative` (bool, default: false)

**New Collection: `list_collaborators`**
```
Fields:
- list (relation to restaurant_lists, required)
- user (relation to users, required)
- role (select: "editor", "viewer")
- invitedBy (relation to users, required)
- created (autodate)
```

**Features:**
- List owner can invite friends as collaborators
- Editors can add/remove restaurants, but not delete list
- Viewers can only view (private list access)

### 3.2 List Templates

**Predefined Templates:**
- "Bucket List" - Places I want to try
- "Date Night" - Romantic restaurants
- "Quick Bites" - Fast casual favorites
- "Group Friendly" - Good for large groups
- "Budget Eats" - Affordable options

Templates pre-fill name/description, user can customize.

### 3.3 List Analytics (Owner View)

**New Endpoint: `GET /api/lists/$listId/stats`**

Returns:
- View count over time
- Follower growth
- Most saved restaurant from this list
- Geographic distribution (if restaurants have lat/lng)

### 3.4 Smart Lists (Auto-Generated)

**Examples:**
- "My Top Rated" - Auto-list of restaurants with 4+ star ratings from user
- "Recently Visited" - Last 10 visited restaurants
- "Most Photographed" - Restaurants with most menu images uploaded

Marked as `isSmartList: true`, read-only.

### 3.5 List Export

**Export Formats:**
- PDF with restaurant names, addresses, notes
- CSV for spreadsheet import
- Share as text (plain list for messaging apps)

---

## Phase 4: Integration with Existing Features

### 4.1 Visit Integration

**Add to `visits` collection:**
- `fromList` (relation to restaurant_lists, optional)

When creating a visit from a list, track which list inspired it.

**List Stats Update:**
Show "X friends visited places from this list" on list detail page.

### 4.2 Restaurant Detail Page Enhancement

**"Appears in Lists" Section:**
- Show which of user's lists contain this restaurant
- Show popular public lists featuring this restaurant
- Quick toggle to add/remove from lists

### 4.3 Search Integration

**Global Search Enhancement:**
- Search lists by name/description
- Filter search results: "Restaurants" / "Lists" / "Users"

---

## Testing Strategy

### Unit Tests (Backend)
- List creation with visibility rules
- List item unique constraint (no duplicates)
- Position reordering logic
- Cascade deletion (list → list_items)

### E2E Tests (Frontend)
```
cypress/e2e/lists.cy.ts:
- Create a new list
- Add restaurants to list
- Reorder list items
- Change list visibility
- Delete list
- Follow/unfollow lists
- Share list link
- View friends' lists
```

### Manual Testing Checklist
- [ ] Create list with cover image
- [ ] Add 10+ restaurants to list
- [ ] Reorder items via drag-and-drop
- [ ] Share list via mobile share sheet
- [ ] View list as friend (friends visibility)
- [ ] View list as stranger (public visibility)
- [ ] Add restaurant to multiple lists
- [ ] Delete list and verify list_items cascade deleted

---

## Migration Path & Rollout

### Phase 1 Rollout: Core Lists (Low Risk)
1. Deploy database migrations
2. Deploy backend with new collections
3. Deploy frontend with list creation/management
4. **User Communication**: Announce lists feature in changelog
5. Monitor: List creation rate, avg items per list

### Phase 2 Rollout: Social Discovery (Medium Risk)
1. Deploy list follows functionality
2. Deploy friends' lists feed
3. Deploy shareable links
4. Monitor: Follow rate, share link clicks

### Phase 3 Rollout: Advanced Features (Gradual)
1. Beta test collaborative lists with small group
2. Roll out templates and smart lists
3. Add analytics for power users
4. Monitor: Collaboration usage, template adoption

---

## Success Metrics

### Phase 1: Adoption
- % of active users who create at least 1 list
- Average number of lists per user
- Average number of restaurants per list
- Most common list names (insights for templates)

### Phase 2: Engagement
- List follow rate (follows per public list)
- List share rate (shares per list)
- View count for shared lists
- Conversion: List view → Restaurant visit

### Phase 3: Retention
- % of collaborative lists still active after 30 days
- Smart list usage vs manual lists
- Export feature usage

---

## UI/UX Considerations (Mobile-First)

### Navigation
- Add "Lists" icon to bottom navigation bar OR
- Add "Lists" section to profile page with prominent CTA

### Quick Actions
- Long-press restaurant card → "Add to List" shortcut
- Swipe gesture on list items to remove

### Empty States
- No lists: "Organize your favorite spots into lists"
- Empty list: "Add restaurants to get started" with search button

### Visual Hierarchy
- List cover images should be prominent (full-width card)
- Restaurant count badge on list cards
- Visibility icon (lock/friends/globe) on list cards

### Performance
- Lazy load restaurant images in lists
- Paginate list items if >50 restaurants
- Cache frequently viewed lists

---

## Data Model Diagram

```
restaurant_lists
├── id
├── name
├── description
├── visibility ("private" | "friends" | "public")
├── user (→ users)
├── coverImage
├── isCollaborative
├── followerCount
└── viewCount

list_items
├── id
├── list (→ restaurant_lists, cascade delete)
├── restaurant (→ restaurants)
├── addedBy (→ users)
├── position
├── note
└── created

list_follows
├── id
├── list (→ restaurant_lists)
├── user (→ users)
└── created

list_collaborators (Phase 3)
├── id
├── list (→ restaurant_lists)
├── user (→ users)
├── role ("editor" | "viewer")
└── invitedBy (→ users)

visits (enhancement)
└── fromList (→ restaurant_lists, optional)
```

---

## Estimated Implementation Time

| Phase | Backend | Frontend | Testing | Total |
|-------|---------|----------|---------|-------|
| Phase 1: Core Lists | 2 days | 5 days | 2 days | 9 days |
| Phase 2: Social Discovery | 2 days | 3 days | 1 day | 6 days |
| Phase 3: Advanced Features | 3 days | 4 days | 2 days | 9 days |
| **Total** | **7 days** | **12 days** | **5 days** | **24 days** |

*Assumes one developer working full-time.*

---

## Open Questions & Decisions Needed

1. **Should lists have a maximum item limit?**
   - Recommendation: Soft limit of 100 items, warn at 50

2. **Can a restaurant appear in multiple lists by the same user?**
   - Recommendation: Yes (e.g., "Pizza" list AND "Date Night" list)

3. **Should list items inherit restaurant visibility?**
   - If restaurant is private, can it appear in a public list?
   - Recommendation: Yes, but show placeholder to non-owners ("Hidden restaurant")

4. **Should we support list-to-list copying?**
   - "Duplicate this list" feature
   - Recommendation: Phase 3, useful for templates

5. **Should list followers get notifications when list is updated?**
   - Could be noisy if list is frequently edited
   - Recommendation: Weekly digest of followed list updates

6. **Mobile navigation priority:**
   - Add "Lists" to bottom nav (requires removing another tab) OR
   - Keep in profile page as secondary feature
   - Recommendation: Start in profile, promote to bottom nav if engagement is high

---

## Integration with Deduplication Plan

### Synergies
- Lists work with any restaurant (public/friends/private)
- List visibility uses same pattern as restaurant visibility
- Sharing lists helps discover new restaurants (reduces duplicate creation)

### Considerations
- If restaurant is merged (Phase 3 of dedup plan), update all `list_items` pointing to source → target
- Add restaurant merge endpoint check: warn if restaurant appears in N lists

---

## References

### Similar Implementations
- Google Maps "Lists" feature
- Yelp Collections
- Foursquare Lists
- Instagram Saved Collections

### Technical Resources
- [PocketBase Collection Rules](https://pocketbase.io/docs/manage-collections/#rules)
- [PocketBase Relations](https://pocketbase.io/docs/collections/#relations)
- [React DnD](https://react-dnd.github.io/react-dnd/) - Drag and drop library
- [Framer Motion](https://www.framer.com/motion/) - Reordering animations

---

## Contact & Questions

For questions or clarifications about this plan, ask Claude to:
- Review specific implementation details
- Provide code examples for any section
- Adjust timelines or scope based on priorities
- Generate migrations or component stubs

**Last Updated**: 2025-11-01

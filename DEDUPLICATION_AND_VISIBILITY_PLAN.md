# Restaurant Deduplication & Visibility Scoping Plan

## Executive Summary

This document outlines the implementation plan for preventing duplicate restaurant entries and adding visibility scoping to the food tracker app. These features will ensure data quality as the user base grows while maintaining user control over shared data.

---

## Current State Analysis

### Existing Architecture
- **Restaurants**: Globally shared collection
  - Any authenticated user can create a restaurant
  - Only the creator (`createdBy` field) can edit/delete
  - All users can view all restaurants
  - Fields: `name`, `location`, `cuisineType`, `placeId`, `latitude`, `longitude`

- **Visits**: User-owned with visibility controls
  - Visibility options: `friends`, `private` (public removed)
  - Visibility cascades to food_items through PocketBase rules

- **Food Items**: Inherit visibility from parent visit
  - Visible based on visit's visibility setting and friendship relationships

### Key Problem
Without duplicate detection or visibility controls, restaurants will accumulate duplicates as users independently create entries for the same physical location. Current global visibility means all duplicates are visible to everyone.

---

## Phase 1: Restaurant Visibility Scoping

### Overview
Add visibility controls to restaurants to allow users to keep locations private, share with friends only, or make public. This reduces duplicate visibility issues while the deduplication system is built.

### 1.1 Database Schema Changes

**New Migration: `add_visibility_to_restaurants`**

Add fields to `restaurants` collection:
```go
// visibility field (select, required, default: "private")
// Options: "private", "friends", "public"
visibility: SelectField {
  Values: ["private", "friends", "public"]
  MaxSelect: 1
  Required: true
}
```

**Backfill Migration: `backfill_restaurant_visibility`**
- Set all existing restaurants to `"public"` to maintain current behavior
- Consider setting restaurants with `createdBy = null` to `"public"` (legacy data)

### 1.2 Access Control Rules Update

**Update `restaurants` collection rules:**
```
ListRule: "
  visibility = 'public' ||
  createdBy = @request.auth.id ||
  (visibility = 'friends' && (
    (@collection.friendships.user.id ?= createdBy &&
     @collection.friendships.friend.id ?= @request.auth.id &&
     @collection.friendships.status ?= 'accepted') ||
    (@collection.friendships.user.id ?= @request.auth.id &&
     @collection.friendships.friend.id ?= createdBy &&
     @collection.friendships.status ?= 'accepted')
  ))
"

ViewRule: [same as ListRule]
CreateRule: "@request.auth.id != ''"
UpdateRule: "createdBy = @request.auth.id"
DeleteRule: "createdBy = @request.auth.id"
```

This mirrors the existing `visits` visibility logic.

### 1.3 Frontend Changes

**Restaurant Creation Flow:**
- Add visibility selector to restaurant creation form
  - Default: "private" (encourages deliberate sharing)
  - Options with descriptions:
    - **Private**: "Only visible to you"
    - **Friends**: "Visible to your friends"
    - **Public**: "Visible to everyone in the community"

**Restaurant Display:**
- Show visibility indicator icon on restaurant cards
- Filter UI: "My Places" / "Friends' Places" / "Community Places"

**User Settings:**
- Add "Default restaurant visibility" preference to user profile
- Stores in new `users.defaultRestaurantVisibility` field

### 1.4 Implementation Order
1. Create database migration for `visibility` field
2. Update PocketBase collection rules
3. Add backfill migration
4. Update restaurant creation form with visibility selector
5. Add visibility icons/indicators to UI
6. Implement filter UI for browsing by visibility
7. Add user preference setting

---

## Phase 2: Duplicate Detection & Prevention

### Overview
Implement intelligent duplicate detection using fuzzy string matching and geolocation proximity to prevent duplicate restaurant entries at creation time.

### 2.1 Duplicate Detection Algorithm

**Matching Criteria (AND logic):**
1. **Name similarity**: Levenshtein distance or Jaro-Winkler > 0.85
   - Handles typos, abbreviations (e.g., "McDonald's" vs "McDonalds")

2. **Location proximity**:
   - If lat/long available: < 100 meters apart
   - If text location only: Fuzzy match on location string > 0.80

3. **Cuisine type match** (if both entries have cuisineType set):
   - Exact match or both empty

**Special Cases:**
- Restaurants with same `placeId` (Google Places ID) are always duplicates
- Chain restaurants: Higher threshold for name matching within same city

### 2.2 Backend Implementation

**New Custom Endpoint: `POST /api/restaurants/check-duplicates`**

```go
// Request
{
  "name": "Pizza Palace",
  "location": "123 Main St, City",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "cuisineType": "Italian",
  "placeId": "ChIJ..." // optional
}

// Response
{
  "hasDuplicates": true,
  "candidates": [
    {
      "id": "abc123",
      "name": "Pizza Palace",
      "location": "123 Main Street, City",
      "distance": 15, // meters, if lat/long available
      "nameSimilarity": 0.95,
      "visibility": "public",
      "createdBy": "user_xyz",
      "createdByName": "John Doe" // expand from users collection
    }
  ]
}
```

**Duplicate Detection Logic:**
```go
func CheckDuplicates(name, location string, lat, lng *float64, placeId string) []Candidate {
  // 1. Exact placeId match (if provided)
  if placeId != "" {
    exactMatches := findByPlaceId(placeId)
    if len(exactMatches) > 0 {
      return exactMatches
    }
  }

  // 2. Fetch candidates within radius (if lat/lng provided)
  var candidates []Restaurant
  if lat != nil && lng != nil {
    // Query restaurants within ~1km radius (filter in app layer)
    candidates = findWithinBounds(lat, lng, 0.01) // ~1km
  } else {
    // Fallback: Fetch all restaurants (or within same city if parseable)
    candidates = getAllRestaurants()
  }

  // 3. Apply fuzzy matching
  matches := []Candidate{}
  for _, candidate := range candidates {
    nameSim := jaroWinkler(normalize(name), normalize(candidate.Name))

    var locSim float64
    var distance *float64
    if lat != nil && lng != nil && candidate.Latitude != nil {
      dist := haversineDistance(lat, lng, candidate.Latitude, candidate.Longitude)
      distance = &dist
      if dist < 100 { // 100 meters
        locSim = 1.0
      }
    } else {
      locSim = jaroWinkler(normalize(location), normalize(candidate.Location))
    }

    // Threshold check
    if nameSim > 0.85 && locSim > 0.80 {
      matches = append(matches, Candidate{
        Restaurant: candidate,
        NameSimilarity: nameSim,
        Distance: distance,
      })
    }
  }

  return matches
}
```

**Dependencies:**
- Add fuzzy string matching library: `github.com/xrash/smetrics` (Jaro-Winkler)
- Geolocation distance: Haversine formula (standard implementation)

### 2.3 Frontend Implementation

**Pre-Creation Duplicate Check Flow:**

1. **Restaurant Creation Form** (`AddRestaurantPage` or modal)
   - User fills in: name, location, cuisine type
   - If using Google Places autocomplete, lat/lng/placeId auto-populated

2. **Real-time Duplicate Detection**
   - Trigger: On blur of location field OR on form submit attempt
   - Call `POST /api/restaurants/check-duplicates` with form data

3. **Duplicate Warning Modal** (if candidates found)
   ```
   ┌─────────────────────────────────────────┐
   │  Possible Duplicates Found              │
   ├─────────────────────────────────────────┤
   │  We found similar restaurants:          │
   │                                         │
   │  [📍] Pizza Palace                      │
   │       123 Main Street, City             │
   │       Italian • 15m away                │
   │       Created by John Doe               │
   │       [Use This Place]                  │
   │                                         │
   │  [📍] Pizza Palace Downtown             │
   │       125 Main St, City                 │
   │       Italian • 45m away                │
   │       Created by Jane Smith             │
   │       [Use This Place]                  │
   │                                         │
   │  ─────────────────────────────────────  │
   │  [Create New Anyway]  [Cancel]          │
   └─────────────────────────────────────────┘
   ```

4. **User Actions:**
   - **Use This Place**: Navigate to selected restaurant detail page (cancel creation)
   - **Create New Anyway**: Proceed with creation (records override in metadata)
   - **Cancel**: Return to form to edit

**UI Components Needed:**
- `DuplicateWarningModal.tsx`
- `RestaurantCandidateCard.tsx` (shows match quality indicators)
- Update `AddRestaurantForm.tsx` to integrate check

### 2.4 Implementation Order
1. Implement backend duplicate detection endpoint
   - Add fuzzy matching library
   - Implement Haversine distance calculation
   - Create `/api/restaurants/check-duplicates` route

2. Write unit tests for matching algorithm
   - Test name variations (abbreviations, typos)
   - Test distance calculations
   - Test edge cases (null lat/lng, missing fields)

3. Create frontend duplicate warning modal
   - Design candidate card layout
   - Implement "Use This Place" vs "Create Anyway" flows

4. Integrate into restaurant creation form
   - Add duplicate check on blur/submit
   - Handle loading states during check
   - Track "manual override" decisions (optional metadata)

5. Add Cypress E2E tests
   - Test duplicate detection triggers
   - Test user selection of existing restaurant
   - Test "Create Anyway" override flow

---

## Phase 3: Duplicate Merging (Admin Tools)

### Overview
Provide admin/moderator tools to merge duplicate restaurants created by different users. This handles duplicates that slip through prevention.

### 3.1 Database Schema

**New Collection: `restaurant_merge_proposals`**
```
Fields:
- sourceRestaurant (relation to restaurants) - The duplicate to merge away
- targetRestaurant (relation to restaurants) - The canonical restaurant to keep
- proposedBy (relation to users) - User who proposed the merge
- status (select: "pending", "approved", "rejected")
- reason (text) - Why these should be merged
- created (autodate)
- reviewedBy (relation to users, optional) - Admin who reviewed
- reviewedAt (date, optional)
```

**Rules:**
- Any authenticated user can create proposals
- Only admins (users with `isAdmin = true`) can approve/reject

### 3.2 Merge Endpoint

**New Custom Endpoint: `POST /api/restaurants/merge`**

Requires admin authentication (`@request.auth.isAdmin = true`)

```go
// Request
{
  "sourceId": "restaurant_to_remove",
  "targetId": "restaurant_to_keep"
}

// Response
{
  "success": true,
  "mergedCount": {
    "visits": 12,
    "menuImages": 3
  }
}
```

**Merge Logic:**
```go
func MergeRestaurants(sourceId, targetId string) error {
  // 1. Validate both restaurants exist and are different

  // 2. Start transaction

  // 3. Update all visits pointing to source -> target
  updateVisits(sourceId, targetId)

  // 4. Update all menu_images pointing to source -> target
  updateMenuImages(sourceId, targetId)

  // 5. Merge metadata (optional):
  //    - If target missing lat/lng but source has it, copy over
  //    - If target missing placeId but source has it, copy over

  // 6. Delete source restaurant
  deleteRestaurant(sourceId)

  // 7. Log merge action (audit trail)
  createAuditLog("restaurant_merge", sourceId, targetId)

  // 8. Commit transaction
  return nil
}
```

### 3.3 Admin UI

**New Page: `/admin/merge-proposals`** (only visible to admins)

Features:
- List all pending merge proposals
- Preview both restaurants side-by-side
- Show affected visits/menu images count
- Approve/Reject buttons
- Bulk merge interface for high-confidence matches

**User-Facing: "Report Duplicate" Button**
- On restaurant detail page, add "Report as Duplicate" action
- Opens modal to search for canonical restaurant
- Submits proposal to `restaurant_merge_proposals` collection

### 3.4 Implementation Order
1. Create `restaurant_merge_proposals` collection
2. Implement merge endpoint with transaction safety
3. Add "Report Duplicate" UI to restaurant pages
4. Build admin merge proposals review page
5. Add audit logging for merges
6. Add E2E tests for merge workflow

---

## Phase 4: Advanced Features (Future)

These are nice-to-haves that can be added after the core system is stable.

### 4.1 Auto-Merge Suggestions
- Nightly cron job to detect high-confidence duplicates (similarity > 0.95)
- Auto-create merge proposals for admin review
- Email digest to admins of pending proposals

### 4.2 Restaurant Claiming
- Mark restaurants as "unclaimed" if created without Google Places data
- Allow users to "claim" a restaurant as the official maintainer
- Claimed restaurants get verified badge
- Multiple users can co-maintain a restaurant

### 4.3 Edit Suggestions
- Non-owners can suggest edits to public restaurants
- Owner/admin approves suggestions
- Similar to Wikipedia's edit proposal system

### 4.4 Reputation & Trust Scores
- Track user contribution quality (accepted edits, valid reports)
- Higher-reputation users get auto-approval for certain actions
- Gamification: badges for contributions

### 4.5 Data Quality Metrics Dashboard
- Admin view: duplicate detection rate, merge frequency
- User view: "data health score" for the community
- Alerts when duplicate rate spikes

---

## Testing Strategy

### Unit Tests (Backend)
- Fuzzy matching algorithm accuracy
- Distance calculations (Haversine)
- Merge transaction rollback on error
- Edge cases (null values, special characters in names)

### Integration Tests (Backend)
- Duplicate detection endpoint with various inputs
- Merge endpoint success/failure scenarios
- PocketBase rule enforcement for visibility

### E2E Tests (Frontend)
- Create restaurant with duplicate warning
- Select existing restaurant from duplicates
- Override duplicate warning
- Submit merge proposal
- Admin approve merge proposal
- Visibility filtering (private/friends/public)

### Manual Testing Checklist
- [ ] Create restaurant with Google Places autocomplete
- [ ] Create restaurant manually without autocomplete
- [ ] Trigger duplicate warning with close match
- [ ] Verify visibility rules (private/friends/public)
- [ ] Merge two restaurants as admin
- [ ] Verify visits/menu images moved to target
- [ ] Test on mobile device (touch interactions)

---

## Migration Path & Rollout

### Phase 1 Rollout: Visibility (Low Risk)
1. Deploy migration to add `visibility` field
2. Backfill existing data to `"public"` (no behavior change)
3. Deploy frontend with visibility controls
4. **User Communication**: Announce new privacy controls
5. Monitor: Track distribution of visibility choices

### Phase 2 Rollout: Duplicate Detection (Medium Risk)
1. Deploy backend endpoint (no UI yet)
2. Test endpoint with production data clone
3. Deploy frontend duplicate warning (soft warning only)
4. Monitor: False positive rate, user override rate
5. Iterate on thresholds based on metrics
6. **User Communication**: Explain how duplicate detection helps

### Phase 3 Rollout: Merging (High Risk - Destructive)
1. Deploy merge endpoint with extensive logging
2. Deploy admin UI to small group of trusted admins
3. Perform test merges with recent data
4. Monitor for data loss or broken references
5. Gradually expand admin access
6. **User Communication**: Transparent changelog of merges

### Rollback Plan
- **Phase 1**: Revert migration, set all to `"public"`
- **Phase 2**: Disable duplicate check endpoint, remove UI
- **Phase 3**: Disable merge endpoint, restore from backup if needed

---

## Success Metrics

### Phase 1: Visibility Scoping
- % of restaurants marked private/friends vs public
- User engagement with visibility settings
- Reduction in "unwanted" duplicates visible to users

### Phase 2: Duplicate Detection
- Duplicate warning display rate
- User override rate (create anyway %)
- Reduction in new duplicates created (compare month-over-month)

### Phase 3: Merging
- Merge proposals submitted per week
- Merge approval rate
- Total duplicates reduced
- User reports of incorrect merges (should be ~0)

---

## Open Questions & Decisions Needed

1. **Should "friends" visibility for restaurants cascade to visits?**
   - If restaurant is friends-only, can you still make a visit public?
   - Recommendation: Visits can be more restrictive, not less (visit ≤ restaurant)

2. **What happens when a public restaurant is changed to private?**
   - Do existing public visits become private?
   - Recommendation: Warn user before changing, show impact count

3. **Should admins be able to edit any restaurant's visibility?**
   - Useful for cleaning up spam/inappropriate content
   - Recommendation: Yes, with audit log

4. **Google Places API integration - when to fetch?**
   - On every restaurant creation? (costly)
   - Only when user searches? (better UX, lower cost)
   - Recommendation: Fetch on search, cache in `restaurants` table

5. **Should we allow multi-location chains (e.g., "McDonald's")?**
   - Each location as separate restaurant? (yes)
   - Or single restaurant with multiple locations? (too complex)
   - Recommendation: Separate restaurants, use placeId to differentiate

6. **Merge conflict resolution:**
   - If both restaurants have different cuisine types, which wins?
   - Recommendation: Target restaurant always wins, log differences

---

## Estimated Implementation Time

| Phase | Backend | Frontend | Testing | Total |
|-------|---------|----------|---------|-------|
| Phase 1: Visibility | 2 days | 3 days | 1 day | 6 days |
| Phase 2: Duplicate Detection | 4 days | 4 days | 2 days | 10 days |
| Phase 3: Merging | 3 days | 3 days | 2 days | 8 days |
| **Total** | **9 days** | **10 days** | **5 days** | **24 days** |

*Assumes one developer working full-time. Adjust for part-time or multiple developers.*

---

## References

### Similar Implementations
- **OpenStreetMap**: Community editing with change proposals
- **Google Maps**: User-submitted place edits requiring review
- **Foursquare**: Duplicate venue detection and merging

### Technical Resources
- [Jaro-Winkler Distance](https://en.wikipedia.org/wiki/Jaro%E2%80%93Winkler_distance)
- [Haversine Formula](https://en.wikipedia.org/wiki/Haversine_formula)
- [PocketBase Collection Rules](https://pocketbase.io/docs/manage-collections/#rules)
- [Fuzzy String Matching in Go](https://github.com/xrash/smetrics)

---

## Appendix: Data Model Diagram

```
users
├── id
├── isAdmin
└── defaultRestaurantVisibility

restaurants
├── id
├── name
├── location
├── latitude
├── longitude
├── placeId
├── cuisineType
├── createdBy (→ users)
└── visibility ("private" | "friends" | "public")

visits
├── id
├── restaurant (→ restaurants)
├── user (→ users)
├── visitDate
└── visibility ("friends" | "private")

food_items
├── id
├── name
├── restaurant (→ restaurants)
├── visit (→ visits)
└── user (→ users)

restaurant_merge_proposals
├── id
├── sourceRestaurant (→ restaurants)
├── targetRestaurant (→ restaurants)
├── proposedBy (→ users)
├── reviewedBy (→ users)
└── status ("pending" | "approved" | "rejected")

friendships
├── id
├── user (→ users)
├── friend (→ users)
└── status ("pending" | "accepted" | "rejected")
```

---

## Contact & Questions

For questions or clarifications about this plan, ask Claude to:
- Review specific implementation details
- Provide code examples for any section
- Adjust timelines or scope based on priorities
- Generate migrations or API endpoint stubs

**Last Updated**: 2025-10-31

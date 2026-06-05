# Admin-Managed Restaurant Groups for Menu Suggestions

Restaurant Groups are admin/system-managed groupings of exact Restaurant locations used to seed trusted menu suggestions across related locations. The first implementation does not create a canonical group menu catalog; instead, Group Menu Suggestions are aggregated from public, approved, group-suitable menu items that remain approved for one exact source Restaurant location.

## Considered Options

- User-scoped Restaurant Groups: useful for personal memory, but not a strong enough trust boundary for showing approved-looking menu suggestions to other users.
- Global or group-level menu items: simpler to query, but they imply canonical availability across every grouped location and create cleanup debt when menus vary by location.
- Mutating user-created items into approved public items: fast for admins, but risks rewriting user intent and confusing visibility ownership.

## Consequences

Admin Restaurant Inventory owns Restaurant Group creation and membership, while menu review consumes existing group membership. Admin approval stays separate from visibility: approved catalog items can be promoted from Catalog Contributions without rewriting historical Visit Item text, and selected Group Menu Suggestions create Visit Items rather than exact-location catalog items. All Locations History remains a separate personal-history fallback, not a trusted menu-seeding source.

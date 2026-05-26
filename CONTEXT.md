# Food Tracker

Food Tracker helps people record restaurant visits, rate food items, and share restaurant recommendations through lists and friend-visible feeds.

## Language

**Restaurant List**:
A user-curated collection of restaurants with bookmarked food-item recommendations.
_Avoid_: List, saved places

**All Locations History**:
A read-only view of a user's own ordered items across visited restaurants whose names match conservatively by normalized restaurant name.
_Avoid for MVP_: Chain, Similar Restaurants, Same-name history

**Restaurant Group**:
A future persisted grouping and correction concept for restaurants that represent the same chain, brand, or user-corrected group across locations. It is not part of **All Locations History**.
_Avoid for MVP_: Chain, same-name history, similar restaurants

**Visit Writes**:
The mobile module that owns creating and updating restaurant visit records, including offline replay payloads, cache effects, source Note completion timing, and queued feedback.
_Avoid_: visit submit helper, visit mutation wrapper

**Food Product Writes**:
The mobile module that owns creating, updating, and deleting food product entries, including offline replay payloads, cache effects, photo usage invalidation, source Note completion timing, and queued feedback.
_Avoid_: food product submit helper, food product mutation wrapper

**Bill Draft**:
The in-progress bill split state before a Bill is saved, including participants, items, split modes, custom tip splits, derived totals, and submit payload construction.
_Avoid_: bill form state, bill helper functions

**Receipt Scan**:
AI-assisted extraction from a transient receipt photo into a Custom **Bill Draft**.
_Avoid_: receipt OCR, bill photo import

**Receipt Line Item**:
A purchasable row extracted from a receipt and represented as one Bill item with a line-total price.
_Avoid_: dish, OCR row

**Source Note Completion**:
The workflow that marks a source Note as used after a Visit or Food Product entry is completed or queued.
_Avoid_: note mark-used helper, note usage side effect

**List Detail**:
The screen for one **Restaurant List**, showing the restaurants and recommendations inside that list.
_Avoid_: Lists page

**Shared Restaurant List**:
A live, read-only view of a **Restaurant List** made accessible through a revocable secret link.
_Avoid_: Public Restaurant List, public list

**List Detail Map**:
A map view of the restaurants inside one **Restaurant List**.
_Avoid_: Lists map

**Food Discovery**:
The exploratory surface for finding restaurants from saved restaurants, Google Places search, nearby search, or storefront photo extraction before recording food activity.
_Avoid_: saved places, restaurant list, discovery feed

**Food Discovery Map**:
The nearby-first map view in **Food Discovery** for spatially exploring restaurants before recording food activity.
_Avoid_: discovery feed map, saved places map, list map

**Your Ordered Items**:
A user's own item-backed food records at one exact restaurant location.
_Avoid_: Your Records, Your Activity

**Tasting Plan**:
The leader-selected set of restaurants and menu items for a group tasting session.
_Avoid_: Suggestions, readiness

**Tasting Rating Submission**:
A participant's personal ratings for the selected menu items they tried during a group tasting session.
_Avoid_: Assigned items

**Tasting Session Writes**:
The mobile module that owns group tasting session lifecycle writes, including creating sessions, joining sessions, invite actions, lobby membership changes, cache effects, and online-only action handling.
_Avoid_: tasting session mutation helper, group tasting action wrapper

**Tasting Plan Writes**:
The mobile module that owns leader-selected **Tasting Plan** changes before tasting starts, including adding/removing restaurants, adding/removing menu items, starting tasting, and refreshing affected session state.
_Avoid_: tasting suggestion helper, planning screen actions

**Tasting Rating Submission Writes**:
The mobile module that owns submitting a participant's **Tasting Rating Submission**, including payload construction, generated Visit photo upload handoff, cache effects, and leader completion.
_Avoid_: tasting submit helper, rating mutation wrapper

**Menu Item Catalog Writes**:
The mobile module that owns creating and updating a restaurant's saved menu item catalog, including cache insertion, invalidation, scan-created records, and tasting-plan handoff after catalog changes.
_Avoid_: menu item form helper, menu item cache snippet

**Photo Processing Submission**:
The workflow that validates processed photos, creates Visit or Food Product entries, applies usage-limit handling, updates affected caches, handles queued feedback, cleans up staged files, and returns the post-submit navigation outcome.
_Avoid_: photo submit hook, process photos helper

**Friend Writes**:
The mobile module that owns friend request and friendship mutation flows, including offline replay payloads, friendship cache effects, queued feedback, and request entry adapters such as manual code entry and QR scanning.
_Avoid_: friend action helper, social mutation wrapper

**Feedback Writes**:
The mobile module that owns user feedback creation and feedback thread replies, including offline replay payloads, feedback list/thread cache effects, and queued feedback.
_Avoid_: feedback submit helper, support message wrapper

**Visit Action Writes**:
The mobile module that owns restaurant visit actions beyond create/update, including deleting visits, moving visit items, converting visit items to food products, replay payloads, and affected cache effects.
_Avoid_: home feed action helper, visit item mutation wrapper

**Settings Preferences**:
The saved mobile preferences for default visibility and Home feed defaults.
_Avoid_: settings form values

**Onboarding Progress**:
The saved mobile onboarding state for first-run completion and per-feature intro dismissal.
_Avoid_: tutorial flags

## Relationships

- A **Restaurant List** contains zero or more restaurants.
- A **Shared Restaurant List** represents exactly one **Restaurant List**.
- A **Shared Restaurant List** shows the current contents of its **Restaurant List**, not a frozen snapshot.
- **All Locations History** spans a user's own item-backed visits at restaurants with conservatively matching names, but it does not replace exact restaurant/location identity.
- **All Locations History** is shown when the user has item-backed orders at two or more matching restaurant locations, or at one matching ordered location that is different from the restaurant currently being viewed.
- **All Locations History** is an MVP read model, not a persisted **Restaurant Group**.
- **All Locations History** counts only matching locations where the user has item-backed visit history.
- **All Locations History** aggregates only the signed-in user's own orders, including private own visits.
- **All Locations History** does not include friends' orders, food products, fuzzy matches, suffix stripping, or correction decisions.
- **All Locations History** may include accessible Google places and user-created restaurants, including private restaurants owned by the user.
- **All Locations History** matches restaurants by exact normalized name equality; suffix stripping and fuzzy brand matching belong to future Restaurant Group work.
- **All Locations History** may help a user start a new Visit by copying a previously ordered item name onto the currently selected restaurant's menu catalog.
- Copying an **All Locations History** item into a Visit creates or reuses a current-restaurant menu item by normalized item name; it does not create or persist a **Restaurant Group**.
- Copying cross-location menu items is an online-only menu catalog action.
- A future **Restaurant Group** may introduce persisted grouping, manual correction, and broader brand matching after the MVP proves useful.
- **Visit Writes** preserve the write lifecycle for restaurant visit creation and editing.
- **Food Product Writes** preserve the write lifecycle for food product creation, editing, and deletion.
- A **Bill Draft** becomes a saved Bill only after validation and payload construction succeed.
- A **Receipt Scan** populates a Custom **Bill Draft** but does not save a Bill.
- A **Receipt Scan** may create zero or more **Receipt Line Items**.
- A **Receipt Line Item** starts unassigned until the user chooses participants.
- Receipt images are not saved with Bills.
- Raw receipt extraction debug output may be stored for admin debugging for failures, invalid responses, and low-confidence extractions, with a 30-day retention window.
- **Source Note Completion** may happen after a completed entry write or be queued after a queued entry write.
- A **List Detail** belongs to exactly one **Restaurant List**.
- A **List Detail Map** plots only the restaurants in its **Restaurant List**.
- **Food Discovery** may surface saved restaurants, Google places, nearby restaurants, and storefront-extracted names, but it does not create a **Restaurant List**.
- **Food Discovery** prioritizes nearby restaurants for exploratory browsing; saved restaurants are fallback or recall content, not the primary discovery result.
- **Food Discovery Map** defaults to current-location nearby exploration, but explicit text or location searches may replace the mapped results.
- Selecting a restaurant in **Food Discovery Map** opens a preview sheet before navigating to restaurant detail.
- Any user-record preview in a **Food Discovery Map** sheet is scoped to the selected restaurant location, not **All Locations History**.
- A **Food Discovery Map** sheet may show **Your Ordered Items** for the selected restaurant location only.
- **Your Ordered Items** include the user's own visit items and standalone food product entries as separate occurrences, ordered by newest tracked date first.
- A **Food Discovery Map** sheet may show the selected restaurant location's saved menu item catalog separately from **Your Ordered Items**.
- **Food Discovery Map** shows the user's GPS location only from device-captured location, not from manually entered search locations.
- **Food Discovery Map** does not show a separate marker for manually entered search locations.
- Entering nearby-first Map exploration in **Food Discovery** is a user-initiated Places search and may consume Places search quota.
- **Food Discovery Map** auto-starts nearby exploration at most once per screen session.
- If nearby exploration cannot use the user's location, **Food Discovery** may still show saved restaurant fallback content with a non-blocking error.
- Clearing exploratory results in **Food Discovery** stops nearby exploration for that screen session until the user explicitly searches again.
- A **Tasting Plan** contains one or more selected restaurants.
- A selected restaurant in a **Tasting Plan** contains zero or more selected menu items until the plan is ready to start.
- A leader selecting a restaurant during tasting planning adds it to the **Tasting Plan** immediately.
- A leader selecting a menu item during tasting planning adds it to the **Tasting Plan** immediately.
- A **Tasting Plan** is built in ordered planning phases: restaurant selection first, then menu item selection.
- Menu item selection in a **Tasting Plan** is scoped to one selected restaurant at a time.
- A menu scan enriches a restaurant's saved menu item catalog; it does not directly add menu items to the **Tasting Plan**.
- The leader may remove selected restaurants and menu items from the **Tasting Plan** before tasting starts.
- Selected menu items are removed from a **Tasting Plan** through the menu item picker, not through a separate plan summary.
- The **Tasting Plan** is locked once tasting starts.
- The leader may move between restaurant selection and menu item selection while planning; only starting the tasting locks the **Tasting Plan**.
- A **Tasting Plan** is ready to start when it has at least one selected restaurant and at least one selected menu item.
- Every participant sees all selected menu items in the **Tasting Plan** and chooses which items to include in their own **Tasting Rating Submission**.
- Saving a **Tasting Rating Submission** creates or updates the participant's own restaurant visit records immediately.
- A participant may edit and resubmit their **Tasting Rating Submission** until the group tasting session is completed.
- Participants save **Tasting Rating Submissions**; only the leader completes the group tasting session.
- The leader may complete a group tasting session before every participant has submitted, with confirmation that missing submissions are omitted from results.
- **Tasting Session Writes** preserve the write lifecycle for group tasting creation, joining, invite actions, lobby changes, and session status movement.
- **Tasting Plan Writes** preserve the write lifecycle for leader-selected restaurants and menu items inside a **Tasting Plan**.
- **Tasting Rating Submission Writes** preserve the write lifecycle for participant ratings and generated Visit photo handoff.
- **Menu Item Catalog Writes** preserve menu item catalog write behavior across Visit creation, Photo Processing, menu scan, and Tasting Plan adapters.
- **Photo Processing Submission** uses **Visit Writes** and **Food Product Writes** to create entries from processed photos.
- **Friend Writes** preserve the write lifecycle for friend request send, accept, decline, cancel, and remove actions.
- **Feedback Writes** preserve the write lifecycle for creating feedback and replying in a feedback thread.
- **Visit Action Writes** build on **Visit Writes** for actions that change existing visits or visit items.
- **Settings Preferences** include default Visit, Restaurant, Restaurant List, and Home feed preferences.
- **Onboarding Progress** is persisted on the authenticated user record and may be updated while offline.

## Example dialogue

> **Dev:** "Should the **List Detail Map** include every list the viewer can see?"
> **Domain expert:** "No - it only plots restaurants from the currently opened **Restaurant List**."

> **Dev:** "Is a **Shared Restaurant List** the same as making a **Restaurant List** public?"
> **Domain expert:** "No - it is a revocable secret-link view, while the Restaurant List keeps its normal visibility."

> **Dev:** "When the leader taps a restaurant during tasting planning, is that just a suggestion?"
> **Domain expert:** "No - leader-picked restaurants are selected into the **Tasting Plan** immediately."

> **Dev:** "Is **Food Discovery** another **Restaurant List**?"
> **Domain expert:** "No - it is an exploratory surface for finding a restaurant before recording food activity."

> **Dev:** "Should **Food Discovery** show saved restaurants before nearby restaurants?"
> **Domain expert:** "No - exploratory browsing should be nearby-first, with saved restaurants as fallback or recall content."

## Flagged ambiguities

- "lists feature" was used to mean both the top-level list index and the detail for one list - resolved: this map belongs to **List Detail**.
- "add to my list" was ambiguous between copying an entire **Restaurant List** and saving recommendations - resolved: the first **Shared Restaurant List** version saves individual recommendations.
- "public list" was used for link sharing - resolved: use **Shared Restaurant List** because public Restaurant List visibility is not part of the current model.
- "food discovery" was ambiguous with saved places and restaurant lists - resolved: **Food Discovery** is an exploratory surface, not a **Restaurant List**.
- "map discovery" was ambiguous between saved-first and nearby-first behavior - resolved: **Food Discovery** exploratory browsing is nearby-first.
- "Your Records" in a **Food Discovery Map** sheet was ambiguous between visits, activity, and item-backed records - resolved: use **Your Ordered Items** for the user's own exact-location item-backed food records.
- "suggestion" was used for leader-picked tasting restaurants and menu items - resolved: in the product language these are selected entries in the **Tasting Plan**.
- "selecting a restaurant" was ambiguous between local UI selection and plan selection - resolved: leader restaurant selection immediately adds the restaurant to the **Tasting Plan**.
- "next" in tasting planning was ambiguous between navigation and planning progress - resolved: it advances the **Tasting Plan** from restaurant selection to menu item selection.
- "scanned menu items" was ambiguous between discovered catalog entries and selected tasting items - resolved: scanned items become restaurant menu catalog entries first, then the leader selects items into the **Tasting Plan**.
- "remove" in tasting planning was ambiguous between restaurant removal and menu item removal - resolved: restaurant removal belongs to restaurant selection, while menu item removal belongs to the menu item picker.

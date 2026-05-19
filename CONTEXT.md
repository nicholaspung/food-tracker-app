# Food Tracker

Food Tracker helps people record restaurant visits, rate food items, and share restaurant recommendations through lists and friend-visible feeds.

## Language

**Restaurant List**:
A user-curated collection of restaurants with bookmarked food-item recommendations.
_Avoid_: List, saved places

**List Detail**:
The screen for one **Restaurant List**, showing the restaurants and recommendations inside that list.
_Avoid_: Lists page

**List Detail Map**:
A map view of the restaurants inside one **Restaurant List**.
_Avoid_: Lists map

**Tasting Plan**:
The leader-selected set of restaurants and menu items for a group tasting session.
_Avoid_: Suggestions, readiness

**Tasting Rating Submission**:
A participant's personal ratings for the selected menu items they tried during a group tasting session.
_Avoid_: Assigned items

## Relationships

- A **Restaurant List** contains zero or more restaurants.
- A **List Detail** belongs to exactly one **Restaurant List**.
- A **List Detail Map** plots only the restaurants in its **Restaurant List**.
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

## Example dialogue

> **Dev:** "Should the **List Detail Map** include every list the viewer can see?"
> **Domain expert:** "No - it only plots restaurants from the currently opened **Restaurant List**."

> **Dev:** "When the leader taps a restaurant during tasting planning, is that just a suggestion?"
> **Domain expert:** "No - leader-picked restaurants are selected into the **Tasting Plan** immediately."

## Flagged ambiguities

- "lists feature" was used to mean both the top-level list index and the detail for one list - resolved: this map belongs to **List Detail**.
- "suggestion" was used for leader-picked tasting restaurants and menu items - resolved: in the product language these are selected entries in the **Tasting Plan**.
- "selecting a restaurant" was ambiguous between local UI selection and plan selection - resolved: leader restaurant selection immediately adds the restaurant to the **Tasting Plan**.
- "next" in tasting planning was ambiguous between navigation and planning progress - resolved: it advances the **Tasting Plan** from restaurant selection to menu item selection.
- "scanned menu items" was ambiguous between discovered catalog entries and selected tasting items - resolved: scanned items become restaurant menu catalog entries first, then the leader selects items into the **Tasting Plan**.
- "remove" in tasting planning was ambiguous between restaurant removal and menu item removal - resolved: restaurant removal belongs to restaurant selection, while menu item removal belongs to the menu item picker.

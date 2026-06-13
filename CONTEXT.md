# Food Tracker

Food Tracker helps people record restaurant visits, rate food items, and share restaurant recommendations through lists and friend-visible feeds.

## Language

**Restaurant List**:
A user-curated collection of restaurants with bookmarked food-item recommendations.
_Avoid_: List, saved places

**Want to Try**:
The system-managed default Restaurant List for each user. It stores restaurants and recommendations the user wants to try later.
_Avoid_: Saved list, default curated list

**All Locations History**:
A read-only view of a user's own ordered items across visited restaurants whose names match conservatively by normalized restaurant name.
_Avoid for MVP_: Chain, Similar Restaurants, Same-name history

**Restaurant Group**:
A future admin/system-managed grouping concept for exact **Restaurant** locations that may share menu suggestions under the same brand or cluster. It is not part of **All Locations History**.
_Avoid for MVP_: Chain, same-name history, similar restaurants, user group

**Visit Writes**:
The mobile module that owns creating and updating restaurant visit records, including offline replay payloads, cache effects, source Note completion timing, and queued feedback.
_Avoid_: visit submit helper, visit mutation wrapper

**Food Product Writes**:
The mobile module that owns creating, updating, and deleting food product entries, including offline replay payloads, cache effects, photo usage invalidation, source Note completion timing, and queued feedback.
_Avoid_: food product submit helper, food product mutation wrapper

**Bill Draft**:
The in-progress bill split state before a Bill is saved, including participants, items, split modes, custom tip splits, derived totals, and submit payload construction.
_Avoid_: bill form state, bill helper functions

**Equal Split**:
A **Bill Draft** mode where one total bill price is divided evenly across participants.
_Avoid_: even split, simple split

**Manual Split**:
A **Bill Draft** mode where participants are chosen from the same basic setup as an **Equal Split**, but each participant's owed amount is entered manually and must match the total bill price.
_Avoid_: custom split, equal split

**Custom Split**:
A **Bill Draft** mode where receipt line items, extras, and optional final-price adjustments determine participant owed amounts.
_Avoid_: receipt split, manual split

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

**Visit Item**:
A user-owned food record attached to one restaurant Visit.
_Avoid_: Menu item, catalog item

**Tasting Plan**:
The leader-selected set of restaurants and menu items for a group tasting session.
_Avoid_: Suggestions, readiness

Technical aliases / legacy names: existing API, storage, and model boundaries may still use suggestion naming for compatibility. `restaurantSuggestionId` is the selected restaurant row in a **Tasting Plan**. `itemSuggestionId` is the selected or previously proposed menu-item row in a **Tasting Plan**. `TastingSuggestionStatus` is the plan-entry selection state: `approved` means selected for the plan, `rejected` means removed or excluded, and `pending` is the legacy unresolved state. New domain docs, issue drafts, and UI copy should continue to use **Tasting Plan**, selected restaurant, and selected menu item language.

**Tasting Rating Submission**:
A participant's personal ratings for the selected menu items they tried during a group tasting session.
_Avoid_: Assigned items

**Tasting Session Lifecycle**:
The shared in-progress progression of a group tasting session from lobby, to planning, to rating, to review.
_Avoid_: leader steps, invitee steps

**Tasting Session Writes**:
The mobile module that owns group tasting session lifecycle writes, including creating sessions, joining sessions, invite actions, lobby membership changes, cache effects, and online-only action handling.
_Avoid_: tasting session mutation helper, group tasting action wrapper

**Tasting Plan Writes**:
The mobile module that owns leader-selected **Tasting Plan** changes before tasting starts, including adding/removing restaurants, adding/removing menu items, starting tasting, and refreshing affected session state.
_Avoid_: tasting suggestion helper, planning screen actions

Technical aliases / legacy names: existing write functions and endpoints may still use names such as `suggestTastingRestaurant`, `suggestTastingMenuItem`, `tasting_session_restaurants`, `restaurant_suggestion`, `restaurantSuggestionId`, and `itemSuggestionId`. Those names refer to selected **Tasting Plan** entries, not a separate suggestions domain.

**Tasting Rating Submission Writes**:
The mobile module that owns submitting a participant's **Tasting Rating Submission**, including payload construction, generated Visit photo upload handoff, cache effects, and leader completion.
_Avoid_: tasting submit helper, rating mutation wrapper

**Menu Item Catalog Writes**:
The mobile module that owns creating and updating a restaurant's saved menu item catalog, including cache insertion, invalidation, scan-created records, and tasting-plan handoff after catalog changes.
_Avoid_: menu item form helper, menu item cache snippet

**Approved Location Menu Item**:
A menu item that an admin has accepted as suitable for one exact **Restaurant** location's menu catalog.
_Avoid_: verified menu item, public menu item

**Group Menu Suggestion**:
An **Approved Location Menu Item** that is safe to show as a tracking shortcut at related restaurant locations without claiming location-specific availability.
_Avoid_: chain menu item, group-level menu item, verified everywhere

**Suggestion Provenance**:
Admin-only evidence that a **Visit Item** was tracked from a **Group Menu Suggestion**.
_Avoid_: user-facing source, review request

**Catalog Contribution**:
Admin-only evidence that user-entered or scanned menu content contributed to an approved catalog menu item.
_Avoid_: duplicate menu item, rewritten history

**Photo Processing Submission**:
The workflow that validates processed photos, creates Visit or Food Product entries, applies usage-limit handling, updates affected caches, handles queued feedback, cleans up staged files, and returns the post-submit navigation outcome.
_Avoid_: photo submit hook, process photos helper

**Friend Writes**:
The mobile module that owns friend request and friendship mutation flows, including offline replay payloads, friendship cache effects, queued feedback, and request entry adapters such as manual code entry and QR scanning.
_Avoid_: friend action helper, social mutation wrapper

**Friend Invite Handoff**:
The TTL-bounded post-signup handoff that stores inviter identity and the invited app-user id locally so signup can complete the inviter relationship after authentication without persisting the invited email.
_Avoid_: friend suggestion, friend recommendation, pending friendship

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

**Notification Signal**:
A product event or state that should draw a user's attention through a device notification, an in-app indicator, or both.
_Avoid_: alert, notification everywhere

**Device Notification**:
An OS-level notification delivered to a user's device from Food Tracker.
_Avoid_: mobile notification, push notification when local notification is meant

**System Notification Permission**:
The OS-level authorization that allows Food Tracker to deliver **Device Notifications** on the current device.
_Avoid_: overall notification preference, master notification toggle

**Remote Device Notification**:
A **Device Notification** sent because Food Tracker server state changed while the user may not be using the app.
_Avoid_: local reminder, in-app notification

**Local Device Notification**:
A **Device Notification** scheduled by the app on a user's device for that user's own reminder.
_Avoid_: push notification, server notification

**Bill Payment Reminder**:
A reminder sent to an app user who still owes money on an active Bill.
_Avoid_: bill created notification, payment nag

**In-App Indicator**:
A visible badge, dot, count, or callout inside Food Tracker that points to an unresolved **Notification Signal**.
_Avoid_: notification visual, red dot

**Notification Preference**:
A user's saved choice for whether Food Tracker may send a category of **Remote Device Notifications**.
_Avoid_: notification permission, system setting

**Notification Device**:
An authenticated app installation that can receive **Remote Device Notifications** for one user.
_Avoid_: push token, phone

**Notification Delivery Log**:
Backend-only operational metadata used to deduplicate, rate-limit, and debug **Remote Device Notifications**.
_Avoid_: notification inbox, user notification history

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
- A future **Restaurant Group** may introduce persisted grouping and broader brand matching after the MVP proves useful.
- **Restaurant Group** is the grouping source for **Group Menu Suggestions**; user-scoped grouping remains personal memory and correction work, not trusted menu seeding.
- **All Locations History** remains a separate personal-history read model from **Group Menu Suggestions**.
- **Restaurant Group** membership is admin-confirmed, though the system may suggest candidate memberships from conservative name matching.
- The system suggests **Restaurant Group** candidates but does not auto-create trusted groups in the first implementation.
- A **Restaurant** belongs to zero or one **Restaurant Group** in the first implementation.
- A **Restaurant Group** may contain many **Restaurant** locations.
- The first implementation models **Restaurant Group** membership as an optional relation from **Restaurant** to **Restaurant Group**.
- Admin Restaurant Inventory owns **Restaurant Group** creation and membership; menu review consumes existing group membership.
- **Visit Writes** preserve the write lifecycle for restaurant visit creation and editing.
- **Food Product Writes** preserve the write lifecycle for food product creation, editing, and deletion.
- A **Bill Draft** becomes a saved Bill only after validation and payload construction succeed.
- An **Equal Split** and **Manual Split** share bill name, participants, and total bill price setup.
- A **Manual Split** differs from an **Equal Split** at review because the user enters each participant's owed amount instead of accepting an automatic even calculation.
- **Equal Split** and **Custom Split** owed amounts are review-only; **Manual Split** is the only split mode where owed amounts are edited directly.
- The Bill payer is the participant who initially paid the bill; new Bills mark the payer paid and other participants unpaid.
- New Bills start with split mode selection; direct shortcuts into deeper split paths are deferred until the step-by-step Bill creation workflow is stable.
- Switching Bill split modes preserves compatible identity and participant details, but resets calculation details that belong only to the previous mode.
- A **Custom Split** starts by choosing between **Receipt Scan** and manual item entry.
- Manual Bill creation paths may continue while offline, but **Receipt Scan** is online-only.
- A **Receipt Scan** populates a Custom **Bill Draft** but does not save a Bill.
- A **Receipt Scan** previews extraction results but leaves item editing, participant selection, and assignment inside the **Bill Draft** workflow.
- A **Receipt Scan** may prefill **Custom Split** item details, but it does not change the **Custom Split** step order.
- Returning from **Receipt Scan** lands on Bill details when bill name or participants are missing, otherwise it lands on item assignment.
- A **Receipt Scan** may create zero or more **Receipt Line Items**.
- A **Receipt Line Item** starts unassigned until the user chooses participants.
- A **Receipt Scan** with no extracted line items may still prefill totals, but the **Custom Split** still requires at least one Bill item before review.
- A positive-price **Receipt Line Item** must be assigned to at least one participant before a **Custom Split** can be reviewed.
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
- A **Tasting Session Lifecycle** starts when a concrete group tasting session lobby exists.
- The visible **Tasting Session Lifecycle** steps are the same for leaders and invitees, but each role needs different guidance for the current action.
- Active group tasting session screens show **Tasting Session Lifecycle** progress in the screen header, while entry forms explain the upcoming lifecycle in body or subtitle copy.
- The visible **Tasting Session Lifecycle** step labels are Lobby, Plan, Rate, and Review.
- A selected restaurant in a **Tasting Plan** contains zero or more selected menu items until the plan is ready to start.
- A leader selecting a restaurant during tasting planning adds it to the **Tasting Plan** immediately.
- A leader selecting a menu item during tasting planning adds it to the **Tasting Plan** immediately.
- A **Tasting Plan** is built in ordered planning phases: restaurant selection first, then menu item selection.
- Tasting planning phases are leader-facing guidance inside the **Tasting Session Lifecycle**, not a separate lifecycle.
- Menu item selection in a **Tasting Plan** is scoped to one selected restaurant at a time.
- A menu scan enriches a restaurant's saved menu item catalog; it does not directly add menu items to the **Tasting Plan**.
- The leader may remove selected restaurants and menu items from the **Tasting Plan** before tasting starts.
- Selected menu items are removed from a **Tasting Plan** through the menu item picker, not through a separate plan summary.
- The **Tasting Plan** is locked once tasting starts.
- The leader may move between restaurant selection and menu item selection while planning; only starting the tasting locks the **Tasting Plan**.
- A **Tasting Plan** is ready to start when it has at least one selected restaurant and at least one selected menu item.
- Every participant sees all selected menu items in the **Tasting Plan** and chooses which items to include in their own **Tasting Rating Submission**.
- **Tasting Rating Submission** payloads identify the selected **Tasting Plan** restaurant with the legacy `restaurantSuggestionId` field.
- **Tasting Rating Submission** payload item ids point at selected **Tasting Plan** menu-item rows, even when the payload field is named `itemId`.
- Saving a **Tasting Rating Submission** creates or updates the participant's own restaurant visit records immediately.
- Reviewing a **Tasting Rating Submission** is the final in-progress stage of the **Tasting Session Lifecycle** before completion.
- A participant may edit and resubmit their **Tasting Rating Submission** until the group tasting session is completed.
- Participants save **Tasting Rating Submissions**; only the leader completes the group tasting session.
- The leader may complete a group tasting session before every participant has submitted, with confirmation that missing submissions are omitted from results.
- The **Tasting Session Lifecycle** is shared by leaders and invitees, while screen instructions vary by role.
- **Tasting Session Writes** preserve the write lifecycle for group tasting creation, joining, invite actions, lobby changes, and session status movement.
- **Tasting Plan Writes** preserve the write lifecycle for leader-selected restaurants and menu items inside a **Tasting Plan**.
- **Tasting Rating Submission Writes** preserve the write lifecycle for participant ratings and generated Visit photo handoff.
- **Menu Item Catalog Writes** preserve menu item catalog write behavior across Visit creation, Photo Processing, menu scan, and Tasting Plan adapters.
- An **Approved Location Menu Item** belongs to one exact **Restaurant** location.
- A **Group Menu Suggestion** starts from an **Approved Location Menu Item** but may be shown at related restaurant locations as memory assistance.
- A **Group Menu Suggestion** does not prove the item is available at every related restaurant location.
- Menu item visibility answers who can see an item; menu item approval answers whether an admin trusts the item for one exact location.
- Menu item approval states are `unreviewed`, `approved`, and `rejected`.
- Admin approval uses the edited menu item name as the canonical **Group Menu Suggestion** label in the first implementation.
- A rejected menu item is excluded from trusted catalog and suggestion use; rejection does not delete or rewrite user history.
- Menu item approval does not automatically change visibility.
- A menu item must be approved before it can become an **Approved Location Menu Item**.
- A **Group Menu Suggestion** source item must be public, approved, and group-suitable.
- Public approved group-suitable source items may produce **Group Menu Suggestions** for any authenticated user who can access the target **Restaurant**.
- Admin promotion may create a system/admin-owned public **Approved Location Menu Item** from a **Catalog Contribution**.
- Admin promotion links the source **Catalog Contribution** automatically but does not rewrite historical user-entered item text.
- **Catalog Contribution** may reference different evidence sources, including user-entered Visit Items, scanned menu items, and menu images.
- Admins may promote a **Visit Item** into a system/admin-owned public **Approved Location Menu Item** without rewriting the original **Visit Item**.
- Admin promotion reuses an existing approved exact-location menu item by normalized name instead of creating a duplicate.
- **Catalog Contribution** records approval evidence, while **Suggestion Provenance** records tracking usage evidence.
- Approved catalog menu items suppress linked or same-name contribution rows in mobile menu selection.
- Linked **Catalog Contributions** may count toward the approved catalog menu item's ordered history without changing the historical item text.
- A **Restaurant Group** does not have its own menu catalog in the first implementation; **Group Menu Suggestions** are aggregated from group-suitable **Approved Location Menu Items** at member restaurants.
- Admins decide whether an **Approved Location Menu Item** is group-suitable; the default is not group-suitable and rejected or unreviewed menu items cannot be group-suitable.
- Selecting a **Group Menu Suggestion** while tracking a Visit creates a **Visit Item**, not an **Approved Location Menu Item**.
- A **Visit Item** inherits its sharing behavior from its Visit.
- **Suggestion Provenance** is accumulated passively for admin review workflows and does not create a review request by itself.
- During Visit tracking, exact-location menu items appear before **Group Menu Suggestions**, and personal history remains a fallback after trusted suggestions.
- **All Locations History** remains the personal-history fallback when trusted **Group Menu Suggestions** are unavailable or sparse.
- Mobile surfaces dedupe **Group Menu Suggestions** by normalized item name while preserving all source evidence internally.
- Exact-location menu items take precedence over **Group Menu Suggestions** with the same normalized item name.
- **Group Menu Suggestions** emphasize approval/source and ordered-history context rather than cross-location rating summaries.
- Restaurant detail may show **Group Menu Suggestions**, but they remain visually separated from exact-location menu items.
- Restaurant detail **Group Menu Suggestions** may start a Visit with the exact Restaurant preselected and the suggested item preselected.
- Restaurant detail distinguishes exact-location ordered history from related-location ordered history.
- Restaurant detail enhancements for **Group Menu Suggestions** are a later implementation slice after Create Visit suggestions.
- Restaurant search remains focused on exact restaurant selection and does not surface **Group Menu Suggestions** in the first implementation.
- Mobile copy describes **Restaurant Group** content as related locations rather than exposing the term Restaurant Group.
- **Group Menu Suggestions** are optional cached assistance while offline and never block Visit creation.
- Queued Visit replay may preserve **Suggestion Provenance**, but stale provenance must not block creating the **Visit Item**.
- **Photo Processing Submission** uses **Visit Writes** and **Food Product Writes** to create entries from processed photos.
- **Friend Writes** preserve the write lifecycle for friend request send, accept, decline, cancel, and remove actions.
- A **Friend Invite Handoff** is created when signup receives a valid inviter code and needs to complete the inviter relationship after auth.
- A **Friend Invite Handoff** is a local auth/friendship handoff, not a friend recommendation surface or a normal friend request.
- A **Friend Invite Handoff** stores inviter identity, invited app-user id, created timestamp, and expiry timestamp, but not the invited user's email.
- A **Friend Invite Handoff** expires after 24 hours and must be cleared on accept, dismiss, invalid parse or shape, account mismatch, or expiry.
- Accepting a **Friend Invite Handoff** creates or accepts the relevant friendship through **Friend Writes** behavior.
- **Feedback Writes** preserve the write lifecycle for creating feedback and replying in a feedback thread.
- **Visit Action Writes** build on **Visit Writes** for actions that change existing visits or visit items.
- **Settings Preferences** include default Visit, Restaurant, Restaurant List, and Home feed preferences.
- **Onboarding Progress** is persisted on the authenticated user record and may be updated while offline.
- A **Notification Signal** may appear as a **Device Notification**, an **In-App Indicator**, or both.
- A **Device Notification** is either a **Remote Device Notification** or a **Local Device Notification**.
- An **In-App Indicator** stays tied to the unresolved product state it represents.
- Food Tracker does not keep a notification inbox for **Notification Signals** in the first version.
- First-version **In-App Indicators** are derived from unresolved domain state rather than notification read history.
- Friend requests use **In-App Indicators** without **Device Notifications**.
- More-row **In-App Indicators** use dot or count-dot badges instead of text status pills.
- More-row **In-App Indicators** use counts when the unresolved state has a meaningful count, and a plain dot when the unresolved state is binary.
- More-row **In-App Indicators** are backed by lightweight feature summaries and may render from cached data while offline.
- Bill owed-money **Remote Device Notifications** are sent only to mapped app-user participants, excluding the actor, when a Bill creation or edit newly gives that participant a pending owed amount greater than zero.
- Bill owed-money **Remote Device Notifications** are not resent for ordinary Bill edits where the participant already owed money.
- The Bill **In-App Indicator** stays visible while the signed-in user owes money on any active Bill.
- A **Bill Payment Reminder** is an explicit payer action, not an automatic recurring reminder.
- A **Bill Payment Reminder** can be sent to the same Bill participant at most once per week.
- Only a successfully sent **Bill Payment Reminder** consumes the weekly reminder slot.
- A **Bill Payment Reminder** is unavailable for custom participants and participants who are already paid.
- Directly invited tasting session users receive **Remote Device Notifications** when a leader creates or resends their invite.
- Tasting session leaders receive an **In-App Indicator** when an active session has a shareable invite code or open invite window.
- Tapping a tasting invite **Device Notification** opens the tasting sessions list for invite acceptance.
- Tapping a Bill owed-money or **Bill Payment Reminder** **Device Notification** opens that Bill's detail.
- Tapping a user-scheduled visit reminder **Local Device Notification** opens Visit creation.
- Monthly friends activity **Remote Device Notifications** are sent at most once per user per month when at least one accepted friend created at least one friend-visible Visit during the previous calendar month.
- Monthly friends activity **Remote Device Notifications** do not count private visits, food products, notes, Bills, or tasting sessions.
- Tapping a monthly friends activity **Device Notification** opens the Home feed filtered to friends.
- **Notification Preferences** are separate from OS notification permission.
- **System Notification Permission** is separate from **Notification Preferences** and belongs to the current device's OS settings.
- Tasting invites, Bills and payment reminders, and monthly friends activity each have their own **Notification Preference**.
- A disabled **System Notification Permission** prevents enabling **Notification Preferences** on that device but does not prevent disabling them.
- A **Notification Preference** may be enabled while its **Remote Device Notification** delivery is blocked by disabled **System Notification Permission** on the current device.
- When Food Tracker cannot confirm **System Notification Permission** on the current device, it should preserve the user's ability to disable **Notification Preferences**.
- When **System Notification Permission** has not been granted yet, Food Tracker may ask for permission in context before enabling **Notification Preferences**.
- Food Tracker should show the current **System Notification Permission** state when a user manages **Notification Preferences**.
- While managing **Notification Preferences**, requests for **System Notification Permission** start from the system notification status action rather than individual preference toggles.
- User-scheduled visit reminders are controlled by their reminder schedule rather than a global **Notification Preference**.
- **Notification Preferences** control only **Remote Device Notification** delivery, not **In-App Indicators**.
- A user may have multiple **Notification Devices**.
- **Remote Device Notifications** are sent only to active **Notification Devices** for the target user.
- Signed-out or invalid **Notification Devices** stop receiving **Remote Device Notifications**.
- Event-driven **Remote Device Notifications** for tasting invites, Bill owed money, and **Bill Payment Reminders** are sent immediately.
- Monthly friends activity **Remote Device Notifications** are sent during a reasonable daytime delivery window.
- User-scheduled visit reminders fire at the chosen relative time.
- Bill **Device Notification** copy does not include owed amounts.
- The **Notification Delivery Log** is not user-facing.
- The **Notification Delivery Log** does not store notification body text or push tokens.
- The **Notification Delivery Log** keeps only the metadata needed for deduplication, rate limiting, delivery debugging, and limited retention.
- Food Tracker asks for OS notification permission only when the user enables a notification-dependent workflow or preference.
- **In-App Indicators** remain available when OS notification permission is denied.
- First-version user-scheduled visit reminders are one-time **Local Device Notifications**.
- First-version user-scheduled visit reminders are device-local and are not synced across devices.
- First-version user-scheduled visit reminders are quick relative reminders from the Add tab, not a dedicated reminder management surface.
- First-version user-scheduled visit reminders support 15-minute, 30-minute, and one-hour options after the user starts the reminder action.
- First-version user-scheduled visit reminders do not collect restaurant names, notes, or other reminder details.

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

> **Dev:** "Is **Want to Try** just another editable **Restaurant List**?"
> **Domain expert:** "No - it is the user's system-managed default list for bookmarks and cannot be deleted or manually edited like curated lists."

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
- "manual" in bill splitting was ambiguous with **Equal Split** because the setup screens are the same - resolved: **Manual Split** keeps the same setup but requires manually entered owed amounts at review.
- "custom" in bill splitting was ambiguous with receipt scanning - resolved: **Custom Split** may start from a **Receipt Scan** or from manual item entry.
- "Saved list" was ambiguous with generic saved states - resolved: the default Restaurant List is **Want to Try**.
- "receipt review" was ambiguous between extraction preview and draft editing - resolved: **Receipt Scan** only previews extraction results; **Bill Draft** owns editing and assignment.
- "pending friend suggestion" was used for the signup inviter handoff - resolved: use **Friend Invite Handoff** in product and domain docs, reserving `pending_friend_suggestion_v1` and friend-suggestion API copy for legacy implementation naming.

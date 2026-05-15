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

## Relationships

- A **Restaurant List** contains zero or more restaurants.
- A **List Detail** belongs to exactly one **Restaurant List**.
- A **List Detail Map** plots only the restaurants in its **Restaurant List**.

## Example dialogue

> **Dev:** "Should the **List Detail Map** include every list the viewer can see?"
> **Domain expert:** "No - it only plots restaurants from the currently opened **Restaurant List**."

## Flagged ambiguities

- "lists feature" was used to mean both the top-level list index and the detail for one list - resolved: this map belongs to **List Detail**.

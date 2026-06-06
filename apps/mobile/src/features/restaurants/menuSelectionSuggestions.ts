import type {
  AllLocationsHistoryRecord,
  GroupMenuSuggestionsRecord,
  MenuItemRecord,
} from '../store/featureStore';

export type MenuSelectionSuggestionSource =
  | 'relatedLocationSuggestion'
  | 'allLocationsHistory';

export interface MenuSelectionSuggestion {
  id: string;
  name: string;
  source: MenuSelectionSuggestionSource;
  suggestionSource?: {
    type: 'groupMenuSuggestion';
    sourceMenuItemId: string;
    sourceRestaurantId?: string;
    restaurantGroupId?: string;
    normalizedItemName?: string;
  };
  latestRating: number;
  latestRestaurantName: string;
  latestRestaurantLocation?: string;
  orderCount: number;
  sourceItemCount?: number;
  sourceRestaurantCount?: number;
}

export interface BuildMenuSelectionSuggestionsInput {
  exactLocationMenuItems?: MenuItemRecord[];
  groupMenuSuggestions?: GroupMenuSuggestionsRecord;
  allLocationsHistory?: AllLocationsHistoryRecord;
  searchQuery?: string;
}

function normalizeMenuSelectionName(value: string): string {
  return value.trim().toLowerCase();
}

function matchesSearch(normalizedName: string, normalizedSearchQuery: string): boolean {
  return !normalizedSearchQuery || normalizedName.includes(normalizedSearchQuery);
}

export function buildMenuSelectionSuggestions({
  exactLocationMenuItems = [],
  groupMenuSuggestions,
  allLocationsHistory,
  searchQuery = '',
}: BuildMenuSelectionSuggestionsInput): MenuSelectionSuggestion[] {
  const normalizedExactLocationNames = new Set(
    exactLocationMenuItems
      .map((item) => normalizeMenuSelectionName(item.name))
      .filter(Boolean),
  );
  const normalizedSearchQuery = normalizeMenuSelectionName(searchQuery);
  const usedSuggestionNames = new Set(normalizedExactLocationNames);
  const suggestions: MenuSelectionSuggestion[] = [];

  for (const suggestion of groupMenuSuggestions?.suggestions ?? []) {
    const normalizedName =
      normalizeMenuSelectionName(suggestion.normalizedItemName) ||
      normalizeMenuSelectionName(suggestion.displayName);
    if (
      !normalizedName ||
      usedSuggestionNames.has(normalizedName) ||
      !matchesSearch(normalizedName, normalizedSearchQuery)
    ) {
      continue;
    }

    usedSuggestionNames.add(normalizedName);
    const latestSource = suggestion.sources[0];
    const sourceMenuItemId = latestSource?.menuItemIds[0]?.trim();
    const relatedSuggestion: MenuSelectionSuggestion = {
      id: `related-location:${normalizedName}`,
      name: suggestion.displayName,
      source: 'relatedLocationSuggestion',
      suggestionSource: sourceMenuItemId
        ? {
            type: 'groupMenuSuggestion',
            sourceMenuItemId,
            sourceRestaurantId: latestSource?.restaurantId,
            restaurantGroupId: groupMenuSuggestions?.restaurantGroupId,
            normalizedItemName: normalizedName,
          }
        : undefined,
      latestRating: 0,
      latestRestaurantName: latestSource?.restaurantName ?? '',
      orderCount: suggestion.ownOrderCount ?? 0,
      sourceItemCount: suggestion.sourceItemCount,
      sourceRestaurantCount: suggestion.sourceRestaurantCount,
    };
    if (latestSource?.restaurantLocation) {
      relatedSuggestion.latestRestaurantLocation = latestSource.restaurantLocation;
    }

    suggestions.push(relatedSuggestion);
  }

  for (const historyItem of allLocationsHistory?.items ?? []) {
    const normalizedName =
      normalizeMenuSelectionName(historyItem.normalizedItemName) ||
      normalizeMenuSelectionName(historyItem.displayName);
    if (
      !normalizedName ||
      usedSuggestionNames.has(normalizedName) ||
      !matchesSearch(normalizedName, normalizedSearchQuery)
    ) {
      continue;
    }

    usedSuggestionNames.add(normalizedName);
    const historySuggestion: MenuSelectionSuggestion = {
      id: historyItem.normalizedItemName || normalizedName,
      name: historyItem.displayName,
      source: 'allLocationsHistory',
      latestRating: historyItem.latestRating,
      latestRestaurantName: historyItem.latestRestaurantName,
      orderCount: historyItem.orderCount,
    };
    if (historyItem.latestRestaurantLocation) {
      historySuggestion.latestRestaurantLocation = historyItem.latestRestaurantLocation;
    }

    suggestions.push(historySuggestion);
  }

  return suggestions;
}

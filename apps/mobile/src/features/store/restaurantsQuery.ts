export const restaurantsQueryKeys = {
  root: ['feature', 'restaurants'] as const,
  searchRoot: ['feature', 'restaurants', 'search'] as const,
  allLocationsHistoryRoot: ['feature', 'restaurants', 'allLocationsHistory'] as const,
  allLocationsHistory: (restaurantId: string) =>
    ['feature', 'restaurants', 'allLocationsHistory', restaurantId.trim()] as const,
  groupMenuSuggestionsRoot: ['feature', 'restaurants', 'groupMenuSuggestions'] as const,
  groupMenuSuggestions: (restaurantId: string) =>
    ['feature', 'restaurants', 'groupMenuSuggestions', restaurantId.trim()] as const,
  suggestionsRoot: ['feature', 'restaurants', 'suggestions'] as const,
  suggestions: (limit: number, search = '') =>
    [
      'feature',
      'restaurants',
      'suggestions',
      limit,
      search.replace(/\s+/g, ' ').trim(),
    ] as const,
  visitStatsRoot: ['feature', 'restaurants', 'visitStats'] as const,
};

export const restaurantsQueryKeys = {
  root: ['feature', 'restaurants'] as const,
  searchRoot: ['feature', 'restaurants', 'search'] as const,
  sameNameHistoryRoot: ['feature', 'restaurants', 'sameNameHistory'] as const,
  sameNameHistory: (restaurantId: string) =>
    ['feature', 'restaurants', 'sameNameHistory', restaurantId.trim()] as const,
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

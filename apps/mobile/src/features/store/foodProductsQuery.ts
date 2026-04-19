function normalizeFoodProductCategoryQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim().toLowerCase();
}

export const foodProductsQueryKeys = {
  root: ['feature', 'foodProducts'] as const,
  detail: (foodProductId: string) => ['feature', 'foodProduct', foodProductId] as const,
  categorySuggestions: (query: string) =>
    ['feature', 'foodProductCategorySuggestions', normalizeFoodProductCategoryQuery(query)] as const,
};

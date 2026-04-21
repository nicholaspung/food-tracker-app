import type { QueryClient } from '@tanstack/react-query';

export const usageQueryKeys = {
  root: ['feature', 'usage'] as const,
  monthlyRoot: ['feature', 'usage', 'monthly'] as const,
  monthly: (scope: string) => ['feature', 'usage', 'monthly', scope] as const,
};

export async function invalidateMonthlyUsageQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: usageQueryKeys.monthlyRoot,
  });
}

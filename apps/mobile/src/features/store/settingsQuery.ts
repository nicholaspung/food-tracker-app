import type { QueryClient } from '@tanstack/react-query';

export const settingsQueryKeys = {
  root: ['feature', 'settings'] as const,
  detail: (userId: string | null | undefined) => ['feature', 'settings', userId ?? null] as const,
};

export async function invalidateSettingsQueries(
  queryClient: QueryClient,
  userId: string | null | undefined,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: settingsQueryKeys.detail(userId),
  });
}

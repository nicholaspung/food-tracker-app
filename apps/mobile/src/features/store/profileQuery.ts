import type { QueryClient, QueryKey } from '@tanstack/react-query';

export const profileQueryKeys = {
  profile: ['feature', 'profile'] as const,
  inviteCodesRoot: ['feature', 'inviteCodes'] as const,
  inviteCodes: (userId: string | null | undefined) => ['feature', 'inviteCodes', userId ?? null] as const,
};

export function isProfileQueryKey(queryKey: QueryKey): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === profileQueryKeys.profile.length &&
    profileQueryKeys.profile.every((segment, index) => queryKey[index] === segment)
  );
}

export async function invalidateInviteCodesQueries(
  queryClient: QueryClient,
  userId: string | null | undefined,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: profileQueryKeys.inviteCodes(userId),
  });
}

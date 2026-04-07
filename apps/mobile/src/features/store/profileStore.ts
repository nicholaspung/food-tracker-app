import type { ProfileRecord } from '../models';
import type { UpdateProfileInput } from './featureStore';
import { trackFeatureMutation } from './featureStoreShared';

export type { UpdateProfileInput } from './featureStore';

interface ProfileDomainStore {
  getProfile: () => Promise<ProfileRecord>;
  updateProfile: (updates: UpdateProfileInput) => Promise<ProfileRecord>;
}

interface ProfileStoreDependencies {
  localDomainStore: ProfileDomainStore;
}

export function createProfileStore(dependencies: ProfileStoreDependencies) {
  const { localDomainStore } = dependencies;

  return {
    async getProfile(): Promise<ProfileRecord> {
      return localDomainStore.getProfile();
    },

    async updateProfile(updates: UpdateProfileInput): Promise<ProfileRecord> {
      return trackFeatureMutation(
        'profile.update',
        () => localDomainStore.updateProfile(updates),
        {
          hasDisplayNameUpdate: updates.displayName !== undefined,
          hasBioUpdate: updates.bio !== undefined,
          hasLocationUpdate: updates.location !== undefined,
          hasFavoriteCuisineUpdate: updates.favoriteCuisine !== undefined,
          hasMarketingPreferenceUpdate: updates.receiveMarketingEmails !== undefined,
        },
      );
    },
  };
}

import type { RecordModel } from 'pocketbase';

import type { ProfileRecord } from '../models';
import type { UpdateProfileInput } from './featureStore';
import { trackFeatureMutation } from './featureStoreShared';
import { getAuthRecord, saveAuthRecord, sendApiRequest } from './pocketbaseGateway';

export type { UpdateProfileInput } from './featureStore';

function syncProfileIntoAuthRecord(profile: ProfileRecord): void {
  const authRecord = getAuthRecord();
  if (!authRecord) {
    return;
  }

  saveAuthRecord({
    ...(authRecord as RecordModel),
    bio: profile.bio,
    favoriteCuisine: profile.favoriteCuisine,
    location: profile.location,
    name: profile.displayName,
    receiveMarketingEmails: profile.receiveMarketingEmails,
  });
}

export async function getProfile(): Promise<ProfileRecord> {
  return sendApiRequest<ProfileRecord>('/api/profile', {
    method: 'GET',
  });
}

export async function updateProfile(updates: UpdateProfileInput): Promise<ProfileRecord> {
  return trackFeatureMutation(
    'profile.update',
    async () => {
      const profile = await sendApiRequest<ProfileRecord>('/api/profile', {
        body: updates,
        method: 'PATCH',
      });

      syncProfileIntoAuthRecord(profile);
      return profile;
    },
    {
      hasBioUpdate: updates.bio !== undefined,
      hasDisplayNameUpdate: updates.displayName !== undefined,
      hasFavoriteCuisineUpdate: updates.favoriteCuisine !== undefined,
      hasLocationUpdate: updates.location !== undefined,
      hasMarketingPreferenceUpdate: updates.receiveMarketingEmails !== undefined,
    },
  );
}

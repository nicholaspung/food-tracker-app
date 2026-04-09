import type { RecordModel } from 'pocketbase';

import type { AuthBootstrapResult } from '../providers/AuthProvider';
import { normalizeAuthUser } from '../types/auth';

const SCREENSHOT_REVIEW_AUTH_TOKEN = 'screenshot-review-mode';

function createScreenshotReviewAuthRecord(): RecordModel {
  return {
    collectionId: 'users',
    collectionName: 'users',
    id: 'screenshot-review-user',
    email: 'screenshots@yummyrecs.local',
    name: 'Screenshot Review',
    friendCode: 'LOCAL000',
    verified: true,
    isAdmin: true,
    isSubscriber: true,
    isBetaUser: true,
    defaultListVisibility: 'friends',
    defaultVisitVisibility: 'friends',
    defaultRestaurantVisibility: 'friends',
    created: '2026-01-01T12:00:00.000Z',
  } as RecordModel;
}

export function createScreenshotReviewAuthBootstrap(): AuthBootstrapResult {
  const authRecord = createScreenshotReviewAuthRecord();
  const user = normalizeAuthUser(authRecord);

  if (!user) {
    throw new Error('Screenshot review auth record was invalid.');
  }

  return {
    authRecord,
    authToken: SCREENSHOT_REVIEW_AUTH_TOKEN,
    user,
  };
}

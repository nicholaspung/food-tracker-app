import { FEATURE_ONBOARDING_ASSETS } from '../lib/onboardingAssets';

jest.mock('../config/env', () => ({
  env: {
    marketingUrl: 'https://yummyrecs.com',
  },
}));

describe('FEATURE_ONBOARDING_ASSETS', () => {
  it('defines stable remote tutorial media for every published tutorial', () => {
    const expectedSlugsByKey = {
      gettingStartedSettings: 'settings',
      gettingStartedSupportInvites: 'support-invites',
      lists: 'lists',
      logNote: 'log-note',
      manageNotes: 'manage-notes',
      processSavedPhotos: 'process-saved-photos',
      splitBill: 'split-bill',
      tipCalculator: 'tip-calculator',
      trackFoodProduct: 'track-food-product',
      trackRestaurantVisit: 'track-restaurant-visit',
    } as const;

    expect(Object.keys(FEATURE_ONBOARDING_ASSETS).sort()).toEqual(
      Object.keys(expectedSlugsByKey).sort(),
    );

    for (const [key, slug] of Object.entries(expectedSlugsByKey)) {
      const media = FEATURE_ONBOARDING_ASSETS[key as keyof typeof FEATURE_ONBOARDING_ASSETS];

      expect(media.posterSource).toBeTruthy();
      expect(media.videoUri).toBe(`https://yummyrecs.com/tutorials/${slug}.mp4`);
    }
  });
});

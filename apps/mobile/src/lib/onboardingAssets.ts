import type { ImageSourcePropType } from 'react-native';

import { env } from '../config/env';

export interface TutorialMediaAsset {
  posterSource: ImageSourcePropType;
  videoUri: string;
}

function buildTutorialVideoUri(slug: string): string {
  return `${env.marketingUrl.replace(/\/+$/, '')}/tutorials/${slug}.mp4`;
}

function buildTutorialMediaAsset(slug: string, posterSource: ImageSourcePropType): TutorialMediaAsset {
  return {
    posterSource,
    videoUri: buildTutorialVideoUri(slug),
  };
}

export const FEATURE_ONBOARDING_ASSETS = {
  gettingStartedSettings: buildTutorialMediaAsset(
    'settings',
    require('../../assets/onboarding/posters/settings.jpg') as ImageSourcePropType,
  ),
  gettingStartedSupportInvites: buildTutorialMediaAsset(
    'support-invites',
    require('../../assets/onboarding/posters/support-invites.jpg') as ImageSourcePropType,
  ),
  trackRestaurantVisit: buildTutorialMediaAsset(
    'track-restaurant-visit',
    require('../../assets/onboarding/posters/track-restaurant-visit.jpg') as ImageSourcePropType,
  ),
  trackFoodProduct: buildTutorialMediaAsset(
    'track-food-product',
    require('../../assets/onboarding/posters/track-food-product.jpg') as ImageSourcePropType,
  ),
  logNote: buildTutorialMediaAsset(
    'log-note',
    require('../../assets/onboarding/posters/log-note.jpg') as ImageSourcePropType,
  ),
  processSavedPhotos: buildTutorialMediaAsset(
    'process-saved-photos',
    require('../../assets/onboarding/posters/process-saved-photos.jpg') as ImageSourcePropType,
  ),
  manageNotes: buildTutorialMediaAsset(
    'manage-notes',
    require('../../assets/onboarding/posters/manage-notes.jpg') as ImageSourcePropType,
  ),
  lists: buildTutorialMediaAsset(
    'lists',
    require('../../assets/onboarding/posters/lists.jpg') as ImageSourcePropType,
  ),
  splitBill: buildTutorialMediaAsset(
    'split-bill',
    require('../../assets/onboarding/posters/split-bill.jpg') as ImageSourcePropType,
  ),
  tipCalculator: buildTutorialMediaAsset(
    'tip-calculator',
    require('../../assets/onboarding/posters/tip-calculator.jpg') as ImageSourcePropType,
  ),
} as const;

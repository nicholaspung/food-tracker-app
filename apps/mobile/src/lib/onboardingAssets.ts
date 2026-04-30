import type { ImageSourcePropType } from 'react-native';

export const FEATURE_ONBOARDING_ASSETS = {
  trackRestaurantVisit: require('../../assets/onboarding/track-restaurant-visit.gif') as ImageSourcePropType,
  trackFoodProduct: require('../../assets/onboarding/track-food-product.gif') as ImageSourcePropType,
  logNote: require('../../assets/onboarding/log-note.gif') as ImageSourcePropType,
  processSavedPhotos: require('../../assets/onboarding/process-saved-photos.gif') as ImageSourcePropType,
  manageNotes: require('../../assets/onboarding/manage-notes.gif') as ImageSourcePropType,
  lists: require('../../assets/onboarding/lists.gif') as ImageSourcePropType,
  splitBill: require('../../assets/onboarding/split-bill.gif') as ImageSourcePropType,
  tipCalculator: require('../../assets/onboarding/tip-calculator.gif') as ImageSourcePropType,
} as const;

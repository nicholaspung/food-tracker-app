import type { ImageSourcePropType } from 'react-native';

export const FEATURE_ONBOARDING_ASSETS = {
  gettingStartedWelcome: require('../../assets/onboarding/getting-started-welcome.gif') as ImageSourcePropType,
  gettingStartedMonthPrivacy: require('../../assets/onboarding/getting-started-month-privacy.gif') as ImageSourcePropType,
  gettingStartedTutorials: require('../../assets/onboarding/getting-started-tutorials.gif') as ImageSourcePropType,
  gettingStartedFriends: require('../../assets/onboarding/getting-started-friends.gif') as ImageSourcePropType,
  gettingStartedMoreTools: require('../../assets/onboarding/getting-started-more-tools.gif') as ImageSourcePropType,
  gettingStartedListsIntro: require('../../assets/onboarding/getting-started-lists-intro.gif') as ImageSourcePropType,
  gettingStartedBillsTips: require('../../assets/onboarding/getting-started-bills-tips.gif') as ImageSourcePropType,
  gettingStartedSettings: require('../../assets/onboarding/getting-started-settings.gif') as ImageSourcePropType,
  gettingStartedSupportInvites: require('../../assets/onboarding/getting-started-support-invites.gif') as ImageSourcePropType,
  trackRestaurantVisit: require('../../assets/onboarding/track-restaurant-visit.gif') as ImageSourcePropType,
  trackFoodProduct: require('../../assets/onboarding/track-food-product.gif') as ImageSourcePropType,
  logNote: require('../../assets/onboarding/log-note.gif') as ImageSourcePropType,
  processSavedPhotos: require('../../assets/onboarding/process-saved-photos.gif') as ImageSourcePropType,
  manageNotes: require('../../assets/onboarding/manage-notes.gif') as ImageSourcePropType,
  lists: require('../../assets/onboarding/lists.gif') as ImageSourcePropType,
  splitBill: require('../../assets/onboarding/split-bill.gif') as ImageSourcePropType,
  tipCalculator: require('../../assets/onboarding/tip-calculator.gif') as ImageSourcePropType,
} as const;

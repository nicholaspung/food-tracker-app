import type { MainOnboardingCardId } from '../types/onboarding';

export const MAIN_ONBOARDING_PUBLISHED_ASSETS: Record<MainOnboardingCardId, boolean> = {
  welcome: false,
  month_privacy: false,
  tutorials: false,
  friends: false,
  more_tools: false,
  lists_intro: false,
  bills_tips: false,
  settings: true,
  support_invites: true,
} as const;

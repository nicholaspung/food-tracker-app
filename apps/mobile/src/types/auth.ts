export interface MainOnboardingState {
  completedVersion?: number;
  completedAt?: string;
}

export type MoreOnboardingCardId = 'lists' | 'splitBill' | 'tipCalculator';

export type AddOnboardingCardId =
  | 'trackRestaurantVisit'
  | 'trackFoodProduct'
  | 'logNote'
  | 'processSavedPhotos'
  | 'manageNotes';

export interface MoreOnboardingCardState {
  dismissedAt?: string;
}

export interface MobileOnboardingState {
  main?: MainOnboardingState;
  moreCards?: Partial<Record<MoreOnboardingCardId, MoreOnboardingCardState>>;
  addCards?: Partial<Record<AddOnboardingCardId, MoreOnboardingCardState>>;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  friendCode?: string;
  createdAt?: string;
  verified: boolean;
  isAdmin?: boolean;
  isSubscriber?: boolean;
  isBetaUser?: boolean;
  mobileOnboardingState?: MobileOnboardingState;
}

function normalizeIsoString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function normalizeMainOnboardingState(value: unknown): MainOnboardingState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const completedVersion =
    typeof record.completedVersion === 'number' && Number.isFinite(record.completedVersion)
      ? record.completedVersion
      : undefined;
  const completedAt = normalizeIsoString(record.completedAt);

  if (completedVersion === undefined && !completedAt) {
    return undefined;
  }

  return {
    completedVersion,
    completedAt,
  };
}

function normalizeMoreOnboardingCardState(value: unknown): MoreOnboardingCardState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const dismissedAt = normalizeIsoString((value as Record<string, unknown>).dismissedAt);
  return dismissedAt ? { dismissedAt } : undefined;
}

export function normalizeMobileOnboardingState(value: unknown): MobileOnboardingState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const main = normalizeMainOnboardingState(record.main);
  const rawMoreCards = record.moreCards;
  const moreCards: MobileOnboardingState['moreCards'] = {};
  const rawAddCards = record.addCards;
  const addCards: MobileOnboardingState['addCards'] = {};

  if (rawMoreCards && typeof rawMoreCards === 'object' && !Array.isArray(rawMoreCards)) {
    const moreCardsRecord = rawMoreCards as Record<string, unknown>;
    const lists = normalizeMoreOnboardingCardState(moreCardsRecord.lists);
    const splitBill = normalizeMoreOnboardingCardState(moreCardsRecord.splitBill);
    const tipCalculator = normalizeMoreOnboardingCardState(moreCardsRecord.tipCalculator);

    if (lists) {
      moreCards.lists = lists;
    }
    if (splitBill) {
      moreCards.splitBill = splitBill;
    }
    if (tipCalculator) {
      moreCards.tipCalculator = tipCalculator;
    }
  }

  if (rawAddCards && typeof rawAddCards === 'object' && !Array.isArray(rawAddCards)) {
    const addCardsRecord = rawAddCards as Record<string, unknown>;
    const trackRestaurantVisit = normalizeMoreOnboardingCardState(addCardsRecord.trackRestaurantVisit);
    const trackFoodProduct = normalizeMoreOnboardingCardState(addCardsRecord.trackFoodProduct);
    const logNote = normalizeMoreOnboardingCardState(addCardsRecord.logNote);
    const processSavedPhotos = normalizeMoreOnboardingCardState(addCardsRecord.processSavedPhotos);
    const manageNotes = normalizeMoreOnboardingCardState(addCardsRecord.manageNotes);

    if (trackRestaurantVisit) {
      addCards.trackRestaurantVisit = trackRestaurantVisit;
    }
    if (trackFoodProduct) {
      addCards.trackFoodProduct = trackFoodProduct;
    }
    if (logNote) {
      addCards.logNote = logNote;
    }
    if (processSavedPhotos) {
      addCards.processSavedPhotos = processSavedPhotos;
    }
    if (manageNotes) {
      addCards.manageNotes = manageNotes;
    }
  }

  if (!main && Object.keys(moreCards).length === 0 && Object.keys(addCards).length === 0) {
    return undefined;
  }

  return {
    ...(main ? { main } : {}),
    ...(Object.keys(moreCards).length > 0 ? { moreCards } : {}),
    ...(Object.keys(addCards).length > 0 ? { addCards } : {}),
  };
}

export function normalizeAuthUser(record: Record<string, unknown> | null | undefined): AuthUser | null {
  if (!record) {
    return null;
  }

  const id = typeof record.id === 'string' ? record.id : '';
  const email = typeof record.email === 'string' ? record.email : '';

  if (!id || !email) {
    return null;
  }

  return {
    id,
    email,
    name: typeof record.name === 'string' ? record.name : undefined,
    friendCode: typeof record.friendCode === 'string' ? record.friendCode : undefined,
    createdAt: typeof record.created === 'string' ? record.created : undefined,
    verified: Boolean(record.verified),
    isAdmin: Boolean(record.isAdmin),
    isSubscriber: Boolean(record.isSubscriber),
    isBetaUser: Boolean(record.isBetaUser),
    mobileOnboardingState: normalizeMobileOnboardingState(record.mobileOnboardingState),
  };
}

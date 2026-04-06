import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';

import {
  resolveDefaultVisitVisibilityFromAuth,
  type MenuItemRecord,
} from '../../features';
import type { RootStackParamList } from '../../navigation/RootNavigator';

export type CreateVisitScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'CreateVisit'
>;
export type CreateVisitNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'CreateVisit'
>;
export type VisitWizardStep = 0 | 1 | 2; // 0-indexed to match StepProgressBar
export type VisitVisibility = 'friends' | 'private';

export interface DraftVisitItemPhoto {
  uri: string;
  name: string;
  mimeType: string;
}

export interface DraftVisitItem {
  id: string;
  name: string;
  rating: number;
  description: string;
  notes: string;
  photos: DraftVisitItemPhoto[];
  sourceMenuItemId?: string;
}

export interface RestaurantStats {
  userVisitCount: number;
  friendCount: number;
}

export const WIZARD_STEPS = [
  { label: 'Restaurant' },
  { label: 'Items' },
  { label: 'Rate & Save' },
];

export const FREE_MONTHLY_PHOTO_LIMIT = 5;
export const FREE_MONTHLY_PHOTO_WARNING_THRESHOLD = 1;

export function resolveDefaultVisitVisibility(): VisitVisibility {
  return resolveDefaultVisitVisibilityFromAuth();
}

export function normalizeSelectionLabel(value: string): string {
  return value.trim().toLowerCase();
}

export function formatVisitCount(count: number): string {
  return `${count} ${count === 1 ? 'visit' : 'visits'}`;
}

export function formatFriendCount(count: number): string {
  return `${count} ${count === 1 ? 'friend' : 'friends'}`;
}

export function buildDraftVisitItem(
  menuItem: Pick<MenuItemRecord, 'id' | 'name'>,
): DraftVisitItem {
  return {
    id: menuItem.id,
    name: menuItem.name,
    rating: 3,
    description: '',
    notes: '',
    photos: [],
    sourceMenuItemId: menuItem.id,
  };
}

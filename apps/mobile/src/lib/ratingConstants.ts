import type { Theme } from '../theme';

export interface RatingOption {
  value: number;
  label: string;
}

export const RATING_OPTIONS = [
  { value: 1, label: "Don't eat" },
  { value: 2, label: 'Not good not bad' },
  { value: 3, label: 'Worth trying' },
  { value: 4, label: 'Would get again' },
  { value: 5, label: 'Eat often' },
] as const satisfies readonly RatingOption[];

export const RATING_LABELS = RATING_OPTIONS.map((option) => option.label);

export function getRatingLabel(rating: number): string {
  return RATING_LABELS[rating - 1] ?? 'Unknown';
}

export function getRatingColor(theme: Theme, rating: number): string {
  switch (rating) {
    case 1:
      return theme.colors.rating.one;
    case 2:
      return theme.colors.rating.two;
    case 3:
      return theme.colors.rating.three;
    case 4:
      return theme.colors.rating.four;
    case 5:
      return theme.colors.rating.five;
    default:
      return theme.colors.text.muted;
  }
}

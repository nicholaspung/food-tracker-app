import { formatDisplayDate } from '../../lib/dateFormatting';
import { formatFriendEntryMonthLabel } from './homeFeedGrouping';
import type { FeedMode } from './homeFeedTypes';

export function formatMapItemDate(value: string, feedMode: FeedMode): string {
  if (feedMode === 'friends') {
    return formatFriendEntryMonthLabel(value);
  }

  return formatDisplayDate(value, {
    fallback: '',
    options: {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    },
  });
}

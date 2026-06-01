import { Ionicons } from '../../ui/AppIcon';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';
import { RatingPill } from './RatingPill';
import { RecordPhotoThumbnailButton, type RecordPhotoEntry } from './RecordPhotoThumbnailButton';

export interface FoodItemRatingRecordRow {
  id: string;
  actions?: ReactNode;
  dateLabel?: string | null;
  label: string;
  note?: string | null;
  rating: number;
  type: 'source' | 'user';
}

interface FoodItemRatingRecordCardProps {
  itemName: string;
  onOpenPhotos: (entries: RecordPhotoEntry[]) => void;
  photoAccessibilityLabel: string;
  photoEntries: RecordPhotoEntry[];
  photoTestID?: string;
  rows: FoodItemRatingRecordRow[];
}

const useStyles = createThemedStyles((theme) => ({
  card: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  itemName: {
    color: theme.colors.text.primary,
    flex: 1,
    ...theme.typography.titleSm,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  meta: {
    alignItems: 'center',
    columnGap: theme.spacing.xxs,
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 4,
  },
  sourceUserRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.info,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 1,
  },
  sourceUserText: {
    color: theme.colors.text.info,
    ...theme.typography.bodySmTightBold,
  },
  userReviewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xxs,
    marginTop: 1,
  },
  userReviewArrow: {
    color: theme.colors.text.info,
    ...theme.typography.bodySm,
  },
  userReviewText: {
    color: theme.colors.text.info,
    ...theme.typography.bodySmTightSemiBold,
  },
  date: {
    color: theme.colors.text.muted,
    ...theme.typography.bodySm,
  },
  note: {
    color: theme.colors.text.secondary,
    flexBasis: '100%',
    ...theme.typography.bodySm,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
}));

export function FoodItemRatingRecordCard({
  itemName,
  onOpenPhotos,
  photoAccessibilityLabel,
  photoEntries,
  photoTestID,
  rows,
}: FoodItemRatingRecordCardProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text numberOfLines={1} style={styles.itemName}>
          {itemName}
        </Text>
        {photoEntries.length > 0 ? (
          <RecordPhotoThumbnailButton
            accessibilityLabel={photoAccessibilityLabel}
            entries={photoEntries}
            onOpen={onOpenPhotos}
            testID={photoTestID}
          />
        ) : null}
      </View>

      {rows.map((row) => (
        <View key={row.id} style={styles.row}>
          <View style={styles.meta}>
            {row.type === 'source' ? (
              <View style={styles.sourceUserRow}>
                <Ionicons color={theme.colors.text.info} name="people-outline" size={11} />
                <Text style={styles.sourceUserText}>{row.label}</Text>
              </View>
            ) : (
              <View style={styles.userReviewRow}>
                <Text style={styles.userReviewArrow}>{'\u21b3'}</Text>
                <Text style={styles.userReviewText}>{row.label}</Text>
              </View>
            )}
            {row.rating > 0 ? <RatingPill rating={row.rating} /> : null}
            {row.dateLabel ? <Text style={styles.date}>{row.dateLabel}</Text> : null}
            {row.note ? <Text style={styles.note}>{row.note}</Text> : null}
          </View>
          {row.actions ? <View style={styles.actions}>{row.actions}</View> : null}
        </View>
      ))}
    </View>
  );
}

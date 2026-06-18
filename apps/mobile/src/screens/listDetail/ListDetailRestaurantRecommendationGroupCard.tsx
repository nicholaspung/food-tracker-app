import { Ionicons } from '../../ui/AppIcon';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SectionHeader } from '../../components/shared';
import { createThemedStyles, useTheme } from '../../theme';
import { Card, Text } from '../../ui';
import type { RestaurantListRecommendationUsageProofRecord } from '../../features';

type RecommendationGroupMode = 'owner' | 'viewer';

interface ListDetailRestaurantRecommendationGroupCardProps<Item> {
  emptyItemsMessage?: string;
  groupIndex: number;
  isLocked?: boolean;
  items: readonly Item[];
  itemSectionTitle?: string;
  lockTestID?: string;
  mode: RecommendationGroupMode;
  notes: readonly string[];
  primaryMetaLabel: string;
  renderItem: (item: Item, itemIndex: number) => ReactNode;
  restaurantId: string;
  restaurantName: string;
  recommendationUsageProofs?: readonly RestaurantListRecommendationUsageProofRecord[];
  reorderControls?: ReactNode;
  secondaryMetaLabel: string | null;
}

const useStyles = createThemedStyles((theme) => ({
  card: {
    gap: theme.spacing.sm,
  },
  restaurantHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  restaurantTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  restaurantIndex: {
    color: theme.colors.text.muted,
    ...theme.typography.bodyLgMedium,
  },
  restaurantTitle: {
    color: theme.colors.text.primary,
    ...theme.typography.bodyLgBold,
  },
  metaRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.xxs,
  },
  metaIcon: {
    flexShrink: 0,
    marginTop: 1,
  },
  metaText: {
    color: theme.colors.text.secondary,
    flex: 1,
    minWidth: 0,
    ...theme.typography.bodyMd,
  },
  section: {
    borderTopColor: theme.colors.border.subtle,
    borderTopWidth: 1,
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
  },
  emptyItemsText: {
    color: theme.colors.text.muted,
    ...theme.typography.label,
  },
  noteText: {
    color: theme.colors.text.secondary,
    fontStyle: 'italic',
    ...theme.typography.bodyMd,
  },
  proofRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  proofText: {
    color: theme.colors.text.secondary,
    flex: 1,
    ...theme.typography.bodyMd,
  },
}));

function formatRecommendationUsageProofLabel(proof: RestaurantListRecommendationUsageProofRecord): string {
  const actorName = proof.actorName.trim() || 'Friend';
  switch (proof.kind) {
    case 'saved_recommendation':
      return `${actorName} saved this`;
    case 'tried_recommendation':
      return `${actorName} tried this`;
    case 'rated_after_try':
      return `${actorName} rated this after trying`;
    default:
      return `${actorName} used this recommendation`;
  }
}

export function ListDetailRestaurantRecommendationGroupCard<Item>({
  emptyItemsMessage = 'No items added yet.',
  groupIndex,
  isLocked = false,
  items,
  itemSectionTitle,
  lockTestID,
  mode,
  notes,
  primaryMetaLabel,
  renderItem,
  restaurantId,
  restaurantName,
  recommendationUsageProofs = [],
  reorderControls,
  secondaryMetaLabel,
}: ListDetailRestaurantRecommendationGroupCardProps<Item>) {
  const theme = useTheme();
  const styles = useStyles();
  const metadataLabel = secondaryMetaLabel
    ? `${primaryMetaLabel} • ${secondaryMetaLabel}`
    : primaryMetaLabel;
  const resolvedItemSectionTitle =
    itemSectionTitle ?? (mode === 'owner' ? 'Bookmarked Items' : 'Recommended Items');

  return (
    <Card style={styles.card} tone="default">
      <View style={styles.restaurantHeaderRow}>
        <View style={styles.restaurantTitleRow}>
          <Text style={styles.restaurantIndex}>{`${groupIndex + 1}.`}</Text>
          <Text style={styles.restaurantTitle}>{restaurantName}</Text>
        </View>
        {mode === 'owner' ? reorderControls : null}
      </View>

      <View style={styles.metaRow}>
        {isLocked ? (
          <Ionicons
            accessibilityLabel="Private restaurant"
            color={theme.colors.text.muted}
            name="lock-closed-outline"
            size={14}
            style={styles.metaIcon}
            testID={lockTestID}
          />
        ) : null}
        <Ionicons
          color={theme.colors.text.muted}
          name="location-outline"
          size={14}
          style={styles.metaIcon}
        />
        <Text style={styles.metaText}>{metadataLabel}</Text>
      </View>

      <View style={styles.section}>
        <SectionHeader title={resolvedItemSectionTitle} titleTone="secondary" />
        {items.length === 0 ? (
          <Text style={styles.emptyItemsText}>{emptyItemsMessage}</Text>
        ) : (
          items.map(renderItem)
        )}
      </View>

      {notes.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Notes" titleTone="secondary" />
          {notes.map((note, noteIndex) => (
            <Text key={`${restaurantId}-note-${noteIndex}`} style={styles.noteText}>
              "{note}"
            </Text>
          ))}
        </View>
      ) : null}

      {recommendationUsageProofs.length > 0 ? (
        <View style={styles.section} testID={`list-detail-recommendation-usage-proofs-${restaurantId}`}>
          <SectionHeader title="Friend Activity" titleTone="secondary" />
          {recommendationUsageProofs.map((proof, proofIndex) => (
            <View key={`${restaurantId}-proof-${proof.actorId}-${proof.kind}-${proofIndex}`} style={styles.proofRow}>
              <Ionicons color={theme.colors.text.muted} name="sparkles-outline" size={14} />
              <Text style={styles.proofText}>{formatRecommendationUsageProofLabel(proof)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

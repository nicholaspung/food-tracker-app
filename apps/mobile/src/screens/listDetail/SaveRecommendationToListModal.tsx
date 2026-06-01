import { Ionicons } from '../../ui/AppIcon';
import { Pressable, View } from 'react-native';

import { ExpandableText, RatingPill, SectionHeader } from '../../components/shared';
import type { RestaurantListRecord } from '../../features';
import { createThemedStyles, useTheme } from '../../theme';
import { Button, Card, Modal, Text } from '../../ui';
import { formatMonthYearLabel } from './listDetailFormatters';
import type { SaveBookmarkTarget } from './listDetailTypes';

interface SaveRecommendationToListModalProps {
  alreadySavedListIds: Set<string>;
  defaultList: RestaurantListRecord | undefined;
  errorMessage: string | null;
  isLoadingLists?: boolean;
  isSaving: boolean;
  onClose: () => void;
  onQuickSave: () => void;
  onSaveSelectedLists: () => void;
  onToggleList: (listId: string) => void;
  selectedListIds: Set<string>;
  target: SaveBookmarkTarget | null;
  targetLists: RestaurantListRecord[];
}

const useStyles = createThemedStyles((theme) => ({
  itemCard: {
    borderColor: theme.colors.border.info,
    gap: theme.spacing.xs,
  },
  itemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xxs,
  },
  itemName: {
    color: theme.colors.text.primary,
    flexShrink: 1,
    ...theme.typography.bodyLgTightBold,
  },
  caption: {
    color: theme.colors.text.secondary,
    ...theme.typography.label,
  },
  metaDot: {
    color: theme.colors.text.muted,
    ...theme.typography.bodySm,
  },
  bookmarkedDate: {
    color: theme.colors.text.muted,
    ...theme.typography.bodySm,
  },
  listHeader: {
    marginTop: theme.spacing.xs,
  },
  listRows: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  listRow: {
    alignItems: 'center',
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 46,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  listRowSelected: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.info,
  },
  listRowDisabled: {
    backgroundColor: theme.colors.background.muted,
    opacity: 0.7,
  },
  listLabelWrap: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  listLabelTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  listName: {
    color: theme.colors.text.primary,
    flexShrink: 1,
    ...theme.typography.labelMdBold,
  },
  listDescription: {
    color: theme.colors.text.muted,
    ...theme.typography.bodySm,
  },
  alreadyLabel: {
    color: theme.colors.text.success,
    ...theme.typography.bodySmTightSemiBold,
  },
  error: {
    color: theme.colors.text.danger,
    ...theme.typography.bodySm,
  },
}));

export function SaveRecommendationToListModal({
  alreadySavedListIds,
  defaultList,
  errorMessage,
  isLoadingLists = false,
  isSaving,
  onClose,
  onQuickSave,
  onSaveSelectedLists,
  onToggleList,
  selectedListIds,
  target,
  targetLists,
}: SaveRecommendationToListModalProps) {
  const styles = useStyles();
  const theme = useTheme();
  const isDefaultListAlreadySaved = Boolean(defaultList?.id && alreadySavedListIds.has(defaultList.id));
  const primaryLabel = selectedListIds.size === 1 ? 'Save to 1 list' : `Save to ${selectedListIds.size} lists`;
  const visitedAtLabel = target ? formatMonthYearLabel(target.visitedAt) : null;

  return (
    <Modal
      description="Choose where to save this bookmarked item."
      onRequestClose={onClose}
      primaryAction={{
        disabled: isSaving || selectedListIds.size === 0,
        label: primaryLabel,
        loading: isSaving,
        onPress: onSaveSelectedLists,
      }}
      secondaryAction={{
        disabled: isSaving,
        label: 'Cancel',
        onPress: onClose,
      }}
      title={target ? `Save from "${target.restaurantName}"` : undefined}
      visible={Boolean(target)}
    >
      {target ? (
        <Card style={styles.itemCard} tone="info">
          <Text style={styles.caption}>Selected item</Text>
          <View style={styles.itemRow}>
            <Text style={styles.itemName}>{target.foodItemName}</Text>
            <Text style={styles.metaDot}>•</Text>
            <RatingPill rating={target.foodItemRating} />
            {visitedAtLabel ? (
              <>
                <Text style={styles.metaDot}>•</Text>
                <Text style={styles.bookmarkedDate}>{visitedAtLabel}</Text>
              </>
            ) : null}
          </View>
        </Card>
      ) : null}

      <Button
        disabled={isSaving || !target || isLoadingLists || isDefaultListAlreadySaved}
        label={
          isLoadingLists
            ? 'Loading your lists...'
            : isDefaultListAlreadySaved
              ? 'Already in "Saved" list'
              : defaultList
                ? 'Quick Save to "Saved" list'
                : 'Create & Save to "Saved" list'
        }
        onPress={onQuickSave}
        variant="secondary"
      />

      {isLoadingLists ? (
        <Text tone="secondary">Loading your lists...</Text>
      ) : targetLists.length > 0 ? (
        <>
          <SectionHeader style={styles.listHeader} title="Or choose lists" titleTone="secondary" />
          <View style={styles.listRows}>
            {targetLists.map((targetList) => {
              const alreadySavedInList = alreadySavedListIds.has(targetList.id);
              const isSelected = selectedListIds.has(targetList.id);
              const visibilityIconName =
                targetList.visibility === 'friends' ? 'people-outline' : 'lock-closed-outline';

              return (
                <Pressable
                  accessibilityRole="button"
                  disabled={alreadySavedInList}
                  key={targetList.id}
                  onPress={() => {
                    onToggleList(targetList.id);
                  }}
                  style={[
                    styles.listRow,
                    isSelected ? styles.listRowSelected : null,
                    alreadySavedInList ? styles.listRowDisabled : null,
                  ]}
                >
                  <Ionicons
                    color={alreadySavedInList ? theme.colors.text.success : theme.colors.text.muted}
                    name={alreadySavedInList || isSelected ? 'checkbox' : 'square-outline'}
                    size={20}
                  />
                  <View style={styles.listLabelWrap}>
                    <View style={styles.listLabelTop}>
                      <Text style={styles.listName}>{targetList.name}</Text>
                      <Ionicons color={theme.colors.text.muted} name={visibilityIconName} size={13} />
                    </View>
                    {targetList.description ? (
                      <ExpandableText
                        collapsedNumberOfLines={1}
                        interactionMode="inline-toggle"
                        stopPropagationOnToggle
                        style={styles.listDescription}
                      >
                        {targetList.description}
                      </ExpandableText>
                    ) : null}
                    {alreadySavedInList ? <Text style={styles.alreadyLabel}>Already saved in this list</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <SectionHeader
          style={styles.listHeader}
          title="No additional lists yet. Use quick save or create a list."
          titleTone="secondary"
        />
      )}

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
    </Modal>
  );
}

import { Ionicons } from '../../ui/AppIcon';
import { Pressable, ScrollView, View } from 'react-native';

import { EmptyState, LoadingState, SectionHeader } from '../../components/shared';
import type { RestaurantListRecord } from '../../features';
import { createThemedStyles, useTheme } from '../../theme';
import { Card, Modal, Text } from '../../ui';
import type { PendingListItemTransferTarget } from './listDetailTypes';

interface ListItemTransferModalProps {
  alreadySavedListIds: Set<string>;
  currentListId: string;
  errorMessage: string | null;
  hasChanges: boolean;
  isLoadingLists: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onToggleList: (listId: string) => void;
  selectedListIds: Set<string>;
  target: PendingListItemTransferTarget | null;
  targetLists: RestaurantListRecord[];
}

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.sm,
  },
  itemCard: {
    borderColor: theme.colors.border.info,
    gap: theme.spacing.xxs,
  },
  caption: {
    color: theme.colors.text.secondary,
    ...theme.typography.label,
  },
  itemName: {
    color: theme.colors.text.primary,
    ...theme.typography.bodyLgTightBold,
  },
  listScroll: {
    maxHeight: 320,
  },
  listRows: {
    gap: theme.spacing.xs,
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
  listName: {
    color: theme.colors.text.primary,
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

export function ListItemTransferModal({
  alreadySavedListIds,
  currentListId,
  errorMessage,
  hasChanges,
  isLoadingLists,
  isSubmitting,
  onClose,
  onConfirm,
  onToggleList,
  selectedListIds,
  target,
  targetLists,
}: ListItemTransferModalProps) {
  const styles = useStyles();
  const theme = useTheme();

  return (
    <Modal
      description="Choose which lists should include this menu item."
      onRequestClose={onClose}
      primaryAction={{
        disabled: isSubmitting || !hasChanges,
        label: 'Save',
        loading: isSubmitting,
        onPress: onConfirm,
        testID: 'list-item-transfer-confirm-button',
      }}
      secondaryAction={{
        disabled: isSubmitting,
        label: 'Cancel',
        onPress: onClose,
        testID: 'list-item-transfer-cancel-button',
      }}
      testID="list-item-transfer-modal"
      title={target?.itemName.trim() ? `Organize "${target.itemName.trim()}"` : 'Organize Item'}
      visible={Boolean(target)}
    >
      {target ? (
        <View style={styles.body}>
          <Card style={styles.itemCard} tone="info">
            <Text style={styles.caption}>{target.restaurantName}</Text>
            <Text style={styles.itemName}>{target.itemName}</Text>
          </Card>

          <SectionHeader title="Lists" titleTone="secondary" />

          {isLoadingLists ? (
            <LoadingState label="Loading your lists..." />
          ) : targetLists.length === 0 ? (
            <EmptyState
              description="Create a list before organizing this item."
              title="No lists"
            />
          ) : (
            <ScrollView style={styles.listScroll}>
              <View style={styles.listRows}>
                {targetLists.map((list) => {
                  const isCurrentList = list.id === currentListId;
                  const isAlreadySaved = alreadySavedListIds.has(list.id);
                  const isSelected = isCurrentList
                    ? selectedListIds.has(list.id)
                    : isAlreadySaved || selectedListIds.has(list.id);
                  const isLockedSavedList = !isCurrentList && isAlreadySaved;
                  const visibilityIconName =
                    list.visibility === 'friends' ? 'people-outline' : 'lock-closed-outline';

                  return (
                    <Pressable
                      accessibilityRole="button"
                      disabled={isLockedSavedList}
                      key={list.id}
                      onPress={() => {
                        onToggleList(list.id);
                      }}
                      style={[
                        styles.listRow,
                        isSelected ? styles.listRowSelected : null,
                        isLockedSavedList ? styles.listRowDisabled : null,
                      ]}
                      testID={`list-item-transfer-list-${list.id}`}
                    >
                      <Ionicons
                        color={isSelected ? theme.colors.text.success : theme.colors.text.muted}
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={20}
                      />
                      <View style={styles.listLabelWrap}>
                        <Text numberOfLines={1} style={styles.listName}>
                          {list.name}
                        </Text>
                        {list.description ? (
                          <Text numberOfLines={2} style={styles.listDescription}>
                            {list.description}
                          </Text>
                        ) : null}
                        {isCurrentList ? (
                          <Text style={styles.alreadyLabel}>Current list</Text>
                        ) : isLockedSavedList ? (
                          <Text style={styles.alreadyLabel}>Already saved in this list</Text>
                        ) : null}
                      </View>
                      <Ionicons color={theme.colors.text.muted} name={visibilityIconName} size={14} />
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        </View>
      ) : null}
    </Modal>
  );
}

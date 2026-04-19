import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, View } from 'react-native';

import {
  OptionList,
  OptionListRow,
  Skeleton,
} from '../../components/shared';
import type { FriendRecord } from '../../features';
import { createThemedStyles, useTheme } from '../../theme';
import { Button, Card, Input, Modal, Text } from '../../ui';
import {
  isSyntheticFriendEmail,
  normalizeFriendName,
} from './shared';

interface BillParticipantPickerSectionProps {
  friendSearchQuery: string;
  hasBlockingFriendsError: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  normalizedFriendSearchQuery: string;
  selectedFriendIds: string[];
  selectedFriends: FriendRecord[];
  shouldShowFriendSearch: boolean;
  totalAcceptedFriends: number;
  visibleFriends: FriendRecord[];
  onChangeFriendSearchQuery: (value: string) => void;
  onConfirmSelection: (friendIds: string[]) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  showLoadMore: boolean;
}

const useStyles = createThemedStyles((theme) => ({
  fieldValue: {
    color: theme.colors.text.primary,
    ...theme.typography.bodyLg,
  },
  friendRowSelected: {
    backgroundColor: theme.colors.status.infoBg,
  },
  friendSearchInput: {
    marginTop: theme.spacing.xs,
  },
  loadMoreButton: {
    marginTop: theme.spacing.xs,
  },
  loadingRow: {
    gap: theme.spacing.xs,
  },
  modalBody: {
    gap: theme.spacing.sm,
  },
  modalListScroll: {
    maxHeight: 280,
  },
  sectionCard: {
    gap: theme.spacing.sm,
  },
  sectionHint: {
    color: theme.colors.text.muted,
  },
  sectionTitle: {
    color: theme.colors.text.primary,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  selectedFriendsSummary: {
    color: theme.colors.text.secondary,
  },
  triggerPlaceholder: {
    color: theme.colors.text.muted,
    ...theme.typography.bodyLg,
  },
}));

function formatSelectedFriendsLabel(selectedFriends: FriendRecord[]): string {
  if (selectedFriends.length === 0) {
    return 'Select friends';
  }

  const selectedNames = selectedFriends.map((friend) => normalizeFriendName(friend));
  if (selectedNames.length <= 2) {
    return selectedNames.join(', ');
  }

  return `${selectedNames.slice(0, 2).join(', ')} +${selectedNames.length - 2} more`;
}

export function BillParticipantPickerSection({
  friendSearchQuery,
  hasBlockingFriendsError,
  isFetchingNextPage,
  isLoading,
  normalizedFriendSearchQuery,
  selectedFriendIds,
  selectedFriends,
  shouldShowFriendSearch,
  totalAcceptedFriends,
  visibleFriends,
  onChangeFriendSearchQuery,
  onConfirmSelection,
  onLoadMore,
  onRetry,
  showLoadMore,
}: BillParticipantPickerSectionProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [draftSelectedFriendIds, setDraftSelectedFriendIds] = useState<string[]>(selectedFriendIds);
  const canOpenPicker =
    isLoading ||
    hasBlockingFriendsError ||
    totalAcceptedFriends > 0 ||
    selectedFriendIds.length > 0;
  const selectedFriendsLabel = useMemo(
    () => formatSelectedFriendsLabel(selectedFriends),
    [selectedFriends],
  );

  useEffect(() => {
    if (!isPickerVisible) {
      return;
    }

    setDraftSelectedFriendIds(selectedFriendIds);
  }, [isPickerVisible, selectedFriendIds]);

  const handleClosePicker = () => {
    setIsPickerVisible(false);
    onChangeFriendSearchQuery('');
  };

  const handleConfirmSelection = () => {
    onConfirmSelection(draftSelectedFriendIds);
    handleClosePicker();
  };

  const handleToggleDraftFriend = (friend: FriendRecord) => {
    setDraftSelectedFriendIds((currentIds) =>
      currentIds.includes(friend.id)
        ? currentIds.filter((currentId) => currentId !== friend.id)
        : [...currentIds, friend.id],
    );
  };

  return (
    <Card style={styles.sectionCard}>
      <View style={styles.sectionTitleRow}>
        <Ionicons
          color={theme.colors.text.secondary}
          name="people-outline"
          size={16}
        />
        <Text style={styles.sectionTitle} variant="titleSm">
          Select Friends
        </Text>
      </View>
      <Text style={styles.sectionHint} variant="bodySmCompact">
        You are always included in the bill.
      </Text>

      <OptionList>
        <OptionListRow
          accessibilityLabel="Select bill friends"
          isLast
          onPress={
            canOpenPicker
              ? () => {
                  setDraftSelectedFriendIds(selectedFriendIds);
                  setIsPickerVisible(true);
                }
              : undefined
          }
          testID="bill-friends-picker-trigger"
          title={selectedFriendsLabel}
          titleStyle={selectedFriends.length === 0 ? styles.triggerPlaceholder : styles.fieldValue}
        />
      </OptionList>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <Skeleton height={20} />
          <Skeleton height={20} />
          <Skeleton height={20} />
        </View>
      ) : null}

      {!isLoading && hasBlockingFriendsError ? (
        <>
          <Text style={styles.sectionHint} variant="bodySmCompact">
            Could not load your friend list right now.
          </Text>
          <Button
            label="Retry"
            onPress={onRetry}
            style={styles.loadMoreButton}
            variant="secondary"
          />
        </>
      ) : null}

      {!isLoading &&
      !hasBlockingFriendsError &&
      normalizedFriendSearchQuery.length === 0 &&
      totalAcceptedFriends === 0 ? (
        <Text style={styles.sectionHint} variant="bodySmCompact">
          No friends available. Add friends first to split a bill.
        </Text>
      ) : null}

      <Text style={styles.selectedFriendsSummary} variant="bodySmCompact">
        {selectedFriendIds.length} friend
        {selectedFriendIds.length === 1 ? '' : 's'} selected
      </Text>

      <Modal
        description="Choose one or more friends, then confirm your selection."
        onRequestClose={handleClosePicker}
        primaryAction={{
          label: 'Confirm Selection',
          onPress: handleConfirmSelection,
          testID: 'bill-friends-picker-confirm-button',
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: handleClosePicker,
          testID: 'bill-friends-picker-cancel-button',
        }}
        testID="bill-friends-picker-modal"
        title="Select Friends"
        visible={isPickerVisible}
      >
        <View style={styles.modalBody}>
          {shouldShowFriendSearch ? (
            <Input
              containerStyle={styles.friendSearchInput}
              onChangeText={onChangeFriendSearchQuery}
              placeholder="Search friends"
              testID="bill-friends-search-input"
              value={friendSearchQuery}
            />
          ) : null}

          {isLoading ? (
            <View style={styles.loadingRow}>
              <Skeleton height={20} />
              <Skeleton height={20} />
              <Skeleton height={20} />
            </View>
          ) : null}

          {!isLoading && hasBlockingFriendsError ? (
            <>
              <Text style={styles.sectionHint} variant="bodySmCompact">
                Could not load your friend list right now.
              </Text>
              <Button
                label="Retry"
                onPress={onRetry}
                style={styles.loadMoreButton}
                variant="secondary"
              />
            </>
          ) : null}

          {!isLoading &&
          !hasBlockingFriendsError &&
          normalizedFriendSearchQuery.length === 0 &&
          totalAcceptedFriends === 0 ? (
            <Text style={styles.sectionHint} variant="bodySmCompact">
              No friends available. Add friends first to split a bill.
            </Text>
          ) : null}

          {!isLoading &&
          !hasBlockingFriendsError &&
          normalizedFriendSearchQuery.length > 0 &&
          visibleFriends.length === 0 ? (
            <Text style={styles.sectionHint} variant="bodySmCompact">
              No friends match your search.
            </Text>
          ) : null}

          {!isLoading && !hasBlockingFriendsError && visibleFriends.length > 0 ? (
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              style={styles.modalListScroll}
            >
              <OptionList>
                {visibleFriends.map((friend, index) => {
                  const isSelected = draftSelectedFriendIds.includes(friend.id);
                  const friendSubtitle = isSyntheticFriendEmail(friend.email)
                    ? undefined
                    : friend.email;

                  return (
                    <OptionListRow
                      chevron={false}
                      isLast={index === visibleFriends.length - 1}
                      key={friend.id}
                      leading={
                        <Ionicons
                          color={
                            isSelected
                              ? theme.colors.text.brand
                              : theme.colors.text.muted
                          }
                          name={isSelected ? 'checkbox' : 'square-outline'}
                          size={20}
                        />
                      }
                      onPress={() => {
                        handleToggleDraftFriend(friend);
                      }}
                      style={isSelected ? styles.friendRowSelected : undefined}
                      subtitle={friendSubtitle}
                      testID={`bill-friends-option-${index}`}
                      title={normalizeFriendName(friend)}
                    />
                  );
                })}
              </OptionList>
            </ScrollView>
          ) : null}

          {!isLoading && !hasBlockingFriendsError && showLoadMore ? (
            <Button
              label={isFetchingNextPage ? 'Loading more...' : 'Load more friends'}
              loading={isFetchingNextPage}
              onPress={onLoadMore}
              style={styles.loadMoreButton}
              testID="bill-friends-load-more-button"
              variant="secondary"
            />
          ) : null}

          <Text style={styles.selectedFriendsSummary} variant="bodySmCompact">
            {draftSelectedFriendIds.length} friend
            {draftSelectedFriendIds.length === 1 ? '' : 's'} selected
          </Text>
        </View>
      </Modal>
    </Card>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import {
  OptionList,
  OptionListRow,
  Skeleton,
} from '../../components/shared';
import { createThemedStyles, useTheme } from '../../theme';
import { Button, Card, Input, Text } from '../../ui';
import type { FriendRecord } from '../../features';
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
  shouldShowFriendSearch: boolean;
  totalAcceptedFriends: number;
  visibleFriends: FriendRecord[];
  onChangeFriendSearchQuery: (value: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onToggleFriend: (friend: FriendRecord) => void;
  showLoadMore: boolean;
}

const useStyles = createThemedStyles((theme) => ({
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
}));

export function BillParticipantPickerSection({
  friendSearchQuery,
  hasBlockingFriendsError,
  isFetchingNextPage,
  isLoading,
  normalizedFriendSearchQuery,
  selectedFriendIds,
  shouldShowFriendSearch,
  totalAcceptedFriends,
  visibleFriends,
  onChangeFriendSearchQuery,
  onLoadMore,
  onRetry,
  onToggleFriend,
  showLoadMore,
}: BillParticipantPickerSectionProps) {
  const theme = useTheme();
  const styles = useStyles();

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

      {shouldShowFriendSearch ? (
        <Input
          containerStyle={styles.friendSearchInput}
          onChangeText={onChangeFriendSearchQuery}
          placeholder="Search friends"
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
        <OptionList>
          {visibleFriends.map((friend, index) => {
            const isSelected = selectedFriendIds.includes(friend.id);
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
                  onToggleFriend(friend);
                }}
                style={isSelected ? styles.friendRowSelected : undefined}
                subtitle={friendSubtitle}
                title={normalizeFriendName(friend)}
              />
            );
          })}
        </OptionList>
      ) : null}

      {!isLoading && !hasBlockingFriendsError && showLoadMore ? (
        <Button
          label={isFetchingNextPage ? 'Loading more...' : 'Load more friends'}
          loading={isFetchingNextPage}
          onPress={onLoadMore}
          style={styles.loadMoreButton}
          variant="secondary"
        />
      ) : null}

      <Text style={styles.selectedFriendsSummary} variant="bodySmCompact">
        {selectedFriendIds.length} friend
        {selectedFriendIds.length === 1 ? '' : 's'} selected
      </Text>
    </Card>
  );
}

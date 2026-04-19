import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import { FriendListItemCard } from '../components/friends';
import {
  ConfirmDestructiveModal,
  EmptyState,
  HeaderAccessoryButton,
  SegmentedControl,
  Skeleton,
  StatusPill,
  TabBrandHeader,
  TabRootScreenScaffold,
  type SegmentedControlOption,
} from '../components/shared';
import {
  friendsQueryKeys,
  listFriendsPage,
  markFriendInviteAccepted,
  removeFriend,
  selectFriendsSummary,
  type FriendRecord,
} from '../features';
import { usePaginatedQueryState } from '../hooks/useListQueryState';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type FriendsScreenProps = NativeStackScreenProps<RootStackParamList, 'Friends'>;

type MainTab = 'my-code' | 'friends-list';
type FriendsSubTab = 'friends' | 'requests' | 'sent';
type FriendRemoveOperationName = 'friend.remove' | 'friend.request.reject' | 'friend.request.cancel';

const MAIN_TAB_OPTIONS: readonly SegmentedControlOption<MainTab>[] = [
  {
    label: 'My Code',
    value: 'my-code',
  },
  {
    label: 'Friends',
    value: 'friends-list',
  },
];

const useStyles = createThemedStyles((theme) => ({
  screenContent: {
    backgroundColor: theme.colors.background.app,
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  mainTabsSection: {
    backgroundColor: theme.colors.background.surface,
    borderBottomColor: theme.colors.border.subtle,
    borderBottomWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  body: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  cardDescription: {
    color: theme.colors.text.secondary,
  },
  codeBox: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.info,
    borderRadius: theme.radii.md,
    borderWidth: 2,
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  codeLabel: {
    color: theme.colors.text.info,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  codeHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  copyButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.info,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  codeText: {
    alignSelf: 'center',
    color: theme.colors.text.info,
    letterSpacing: 3,
  },
  qrContainer: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  qrDescription: {
    paddingHorizontal: theme.spacing.sm,
    textAlign: 'center',
  },
  cardTitle: {},
  cardsList: {
    gap: theme.spacing.sm,
  },
  iconAction: {
    padding: 2,
  },
  textAction: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xxs,
  },
  textActionMuted: {
    color: theme.colors.text.secondary,
  },
  requestActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  sentActions: {
    alignItems: 'flex-end',
    gap: theme.spacing.xxs,
  },
  actionPill: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    minWidth: 72,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  actionPillSuccess: {
    backgroundColor: theme.colors.status.successBg,
    borderColor: theme.colors.border.success,
  },
  actionPillDanger: {
    backgroundColor: theme.colors.status.dangerBg,
    borderColor: theme.colors.border.danger,
  },
  actionPillLabel: {},
  actionPillSuccessLabel: {
    color: theme.colors.text.success,
  },
  actionPillDangerLabel: {
    color: theme.colors.text.danger,
  },
  skeletonList: {
    gap: theme.spacing.sm,
  },
}));

function generateFriendCode(userId: string | undefined, persistedFriendCode?: string): string {
  const normalizedPersistedCode = persistedFriendCode?.trim().toUpperCase();
  if (normalizedPersistedCode && normalizedPersistedCode.length === 8) {
    return normalizedPersistedCode;
  }

  if (!userId) {
    return 'LOCAL000';
  }

  const cleanId = userId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleanId.slice(0, 8).padEnd(8, 'X');
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }

  return date.toLocaleDateString();
}

export function FriendsScreen({ navigation, route }: FriendsScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();

  const [mainTab, setMainTab] = useState<MainTab>('friends-list');
  const [friendsSubTab, setFriendsSubTab] = useState<FriendsSubTab>('friends');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [pendingRemoveFriend, setPendingRemoveFriend] = useState<FriendRecord | null>(null);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const friendsQuery = useInfiniteQuery({
    queryKey: friendsQueryKeys.paginated(friendsSubTab),
    queryFn: ({ pageParam, signal }) =>
      listFriendsPage({
        section: friendsSubTab,
        page: pageParam,
        pageSize: 20,
        signal,
      }),
    enabled: mainTab === 'friends-list',
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    refetchOnReconnect: 'always',
  });
  const friendsState = usePaginatedQueryState({
    data: friendsQuery.data,
    enabled: mainTab === 'friends-list',
    isError: friendsQuery.isError,
    isFetching: friendsQuery.isFetching,
    isLoading: friendsQuery.isLoading,
    isSuccess: friendsQuery.isSuccess,
  });
  const visibleFriends = friendsState.items;
  const friendsSummary = selectFriendsSummary(friendsQuery.data);
  const acceptedFriendsCount =
    friendsSummary?.friendsCount ?? (friendsSubTab === 'friends' ? visibleFriends.length : 0);
  const pendingReceivedCount =
    friendsSummary?.requestsCount ?? (friendsSubTab === 'requests' ? visibleFriends.length : 0);
  const pendingSentCount =
    friendsSummary?.sentCount ?? (friendsSubTab === 'sent' ? visibleFriends.length : 0);

  const myFriendCode = useMemo(
    () => generateFriendCode(user?.id, user?.friendCode),
    [user?.friendCode, user?.id],
  );
  const myFriendQrPayload = useMemo(
    () => `yummyrecs://friends/add?friendCode=${encodeURIComponent(myFriendCode)}`,
    [myFriendCode],
  );

  const friendSummary = `${acceptedFriendsCount} friend${acceptedFriendsCount === 1 ? '' : 's'}`;
  const friendsSubTabOptions = useMemo<readonly SegmentedControlOption<FriendsSubTab>[]>(
    () => [
      {
        label: 'Friends',
        value: 'friends',
        badgeCount: acceptedFriendsCount,
      },
      {
        label: 'Requests',
        value: 'requests',
        badgeCount: pendingReceivedCount,
        badgeTone: 'alert',
      },
      {
        label: 'Sent',
        value: 'sent',
        badgeCount: pendingSentCount,
      },
    ],
    [acceptedFriendsCount, pendingReceivedCount, pendingSentCount],
  );

  useEffect(() => {
    if (!route.params?.initialSection && !route.params?.initialFriendsSubTab) {
      return;
    }

    if (route.params.initialSection) {
      setMainTab(route.params.initialSection);
    }

    if (route.params.initialFriendsSubTab) {
      setMainTab('friends-list');
      setFriendsSubTab(route.params.initialFriendsSubTab);
    }

    navigation.setParams({
      initialSection: undefined,
      initialFriendsSubTab: undefined,
    });
  }, [navigation, route.params]);

  const styles = useStyles();

  const invalidateFriends = async () => {
    await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
  };

  const handleAccept = async (friendId: string) => {
    setErrorMessage(null);
    setIsMutating(true);

    try {
      const acceptResult = await writeFeature({
        operationName: 'friend.accept',
        offline: {
          strategy: 'outbox',
          payload: { friendId },
        },
        execute: () => markFriendInviteAccepted(friendId),
      });

      if (acceptResult.status === 'queued') {
        await invalidateFriends();
        showQueuedOfflineAlert('Friend action');
        return;
      }

      await invalidateFriends();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not accept friend request.';
      setErrorMessage(message);
    } finally {
      setIsMutating(false);
    }
  };

  const handleRemove = async (friendId: string, operationName: FriendRemoveOperationName) => {
    setErrorMessage(null);
    setIsMutating(true);

    try {
      const removeResult = await writeFeature({
        operationName,
        offline: {
          strategy: 'outbox',
          payload: { friendId },
        },
        execute: () => removeFriend(friendId),
      });

      if (removeResult.status === 'queued') {
        await invalidateFriends();
        showQueuedOfflineAlert('Friend action');
        return true;
      }

      await invalidateFriends();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update this friend entry.';
      setErrorMessage(message);
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const closeRemoveModal = () => {
    if (isMutating) {
      return;
    }

    setPendingRemoveFriend(null);
  };
  const handleRefresh = async () => {
    setIsPullRefreshing(true);

    try {
      if (mainTab === 'friends-list') {
        await friendsQuery.refetch();
      }
    } finally {
      setIsPullRefreshing(false);
    }
  };

  const handleConfirmRemoveFriend = async () => {
    if (!pendingRemoveFriend) {
      return;
    }

    const removed = await handleRemove(pendingRemoveFriend.id, 'friend.remove');
    if (removed) {
      setPendingRemoveFriend(null);
    }
  };

  const handleCopyFriendCode = async () => {
    setErrorMessage(null);
    trackObservabilityEvent('FRIEND_CODE_COPY_STARTED', {
      source: 'FriendsScreen',
    });

    try {
      await Clipboard.setStringAsync(myFriendCode);
      trackObservabilityEvent('FRIEND_CODE_COPIED', {
        source: 'FriendsScreen',
      });
      Alert.alert('Copied', 'Friend code copied to clipboard.');
    } catch (error) {
      trackObservabilityEvent('FRIEND_CODE_COPY_FAILED', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : 'unknown_error',
        source: 'FriendsScreen',
      });
      setErrorMessage('Could not copy friend code.');
    }
  };

  const renderFriendsTabContent = () => {
    if (friendsQuery.isLoading) {
      return (
        <View style={styles.skeletonList}>
          <Skeleton height={110} />
          <Skeleton height={110} />
          <Skeleton height={110} />
        </View>
      );
    }

    if (friendsState.hasBlockingError) {
      return (
        <>
          <PageErrorToast
            errorMessage="Could not load friendship data."
            title="Friends unavailable"
            actionLabel="Retry"
            onAction={() => {
              void friendsQuery.refetch();
            }}
          />
          <EmptyState description="Could not load friendship data." title="Friends unavailable" />
        </>
      );
    }

    const loadMoreButton = friendsQuery.hasNextPage ? (
      <Button
        label={friendsQuery.isFetchingNextPage ? 'Loading more...' : 'Load more'}
        loading={friendsQuery.isFetchingNextPage}
        onPress={() => {
          void friendsQuery.fetchNextPage();
        }}
        variant="secondary"
      />
    ) : null;

    if (friendsSubTab === 'friends') {
      if (visibleFriends.length === 0) {
        return (
          <EmptyState
            description="Add friends to compare visits and food ratings."
            tone="default"
            title="No friends yet"
          />
        );
      }

      return (
        <View style={styles.cardsList}>
          {visibleFriends.map((friend) => (
            <FriendListItemCard
              iconColor={theme.colors.text.info}
              iconName="people-outline"
              key={friend.id}
              meta={`Friends since ${formatDate(friend.createdAt)}`}
              name={friend.name}
              tone="info"
              rightContent={
                <Pressable
                  accessibilityLabel={`Remove friend ${friend.name}`}
                  accessibilityRole="button"
                  disabled={isMutating}
                  onPress={() => {
                    setErrorMessage(null);
                    setPendingRemoveFriend(friend);
                  }}
                  style={styles.iconAction}
                  testID={`friend-remove-button-${friend.id}`}
                >
                  <Ionicons color={theme.colors.text.danger} name="trash-outline" size={18} />
                </Pressable>
              }
            />
          ))}
          {loadMoreButton}
        </View>
      );
    }

    if (friendsSubTab === 'requests') {
      if (visibleFriends.length === 0) {
        return <EmptyState description="Incoming requests appear here." tone="default" title="No pending requests" />;
      }

      return (
        <View style={styles.cardsList}>
          {visibleFriends.map((friend) => (
            <FriendListItemCard
              iconColor={theme.colors.text.warning}
              iconName="person-add-outline"
              key={friend.id}
              meta={`Sent ${formatDate(friend.createdAt)}`}
              name={friend.name}
              tone="warning"
              rightContent={
                <View style={styles.requestActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isMutating}
                    onPress={() => {
                      void handleAccept(friend.id);
                    }}
                    style={[styles.actionPill, styles.actionPillSuccess]}
                  >
                    <Text
                      style={[styles.actionPillLabel, styles.actionPillSuccessLabel]}
                      variant="metaTightStrong"
                    >
                      Accept
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isMutating}
                    onPress={() => {
                      void handleRemove(friend.id, 'friend.request.reject');
                    }}
                    style={[styles.actionPill, styles.actionPillDanger]}
                  >
                    <Text
                      style={[styles.actionPillLabel, styles.actionPillDangerLabel]}
                      variant="metaTightStrong"
                    >
                      Decline
                    </Text>
                  </Pressable>
                </View>
              }
            />
          ))}
          {loadMoreButton}
        </View>
      );
    }

    if (visibleFriends.length === 0) {
      return <EmptyState description="Requests you send will show up here." tone="default" title="No sent requests" />;
    }

    return (
      <View style={styles.cardsList}>
        {visibleFriends.map((friend) => (
          <FriendListItemCard
            iconColor={theme.colors.text.secondary}
            iconName="time-outline"
            key={friend.id}
            meta={`Sent ${formatDate(friend.createdAt)}`}
            name={friend.name}
            tone="muted"
            rightContent={
              <View style={styles.sentActions}>
                <StatusPill label="Pending" tone="warning" />
                <Pressable
                  accessibilityRole="button"
                  disabled={isMutating}
                  onPress={() => {
                    void handleRemove(friend.id, 'friend.request.cancel');
                  }}
                  style={styles.textAction}
                >
                  <Text style={styles.textActionMuted} variant="bodyBaseSemiBold">Cancel</Text>
                </Pressable>
              </View>
            }
          />
        ))}
        {loadMoreButton}
      </View>
    );
  };

  return (
    <TabRootScreenScaffold
      contentStyle={styles.screenContent}
      keyboardAware
      onRefresh={handleRefresh}
      refreshing={isPullRefreshing}
      scrollUnderlayColor={theme.colors.background.app}
      testID="friends-screen"
    >
      <TabBrandHeader
        rightAccessory={
          <HeaderAccessoryButton
            accessibilityLabel="Add friend"
            label="Add Friend"
            onPress={() => {
              navigation.navigate('AddFriend');
            }}
            testID="friends-add-friend-button"
          />
        }
        showBrand={false}
        subtitle={friendSummary}
        title="Friends"
        titleVariant="displayLg"
      />

      <View style={styles.mainTabsSection}>
        <SegmentedControl onChange={setMainTab} options={MAIN_TAB_OPTIONS} value={mainTab} />
      </View>

      <View style={styles.body}>
        <PageErrorToast errorMessage={errorMessage} title="Friend operation failed" />
        <PageErrorToast
          errorMessage={friendsState.hasRefreshError ? 'Could not refresh friendship data. Showing saved data.' : null}
          title="Friends unavailable"
          actionLabel="Retry"
          onAction={() => {
            void friendsQuery.refetch();
          }}
        />

        {mainTab === 'my-code' ? (
          <Card>
            <Text style={styles.cardTitle} variant="sectionTitleTight">My Friend Code</Text>
            <Text style={styles.cardDescription}>Share this code so friends can send you a request.</Text>
            <View style={styles.codeBox}>
              <View style={styles.codeHeaderRow}>
                <Text style={styles.codeLabel} variant="bodySmTightSemiBold">Friend Code</Text>
                <Pressable
                  accessibilityLabel="Copy friend code"
                  accessibilityRole="button"
                  onPress={() => {
                    void handleCopyFriendCode();
                  }}
                  style={styles.copyButton}
                >
                  <Ionicons color={theme.colors.text.info} name="copy-outline" size={16} />
                </Pressable>
              </View>
              <Text style={styles.codeText} variant="displaySm">{myFriendCode}</Text>
            </View>
            <View style={styles.qrContainer}>
              <QRCode
                backgroundColor={theme.colors.background.surface}
                color={theme.colors.text.primary}
                quietZone={8}
                size={176}
                value={myFriendQrPayload}
              />
              <Text style={styles.qrDescription} tone="secondary">
                Friends can scan this QR code to autofill your friend code.
              </Text>
            </View>
          </Card>
        ) : null}

        {mainTab === 'friends-list' ? (
          <>
            <SegmentedControl onChange={setFriendsSubTab} options={friendsSubTabOptions} value={friendsSubTab} />

            {renderFriendsTabContent()}
          </>
        ) : null}
      </View>

      <ConfirmDestructiveModal
        cancelLabel="Keep Friend"
        confirmLabel="Remove Friend"
        confirmLoadingLabel="Removing..."
        description={
          pendingRemoveFriend
            ? `Remove ${pendingRemoveFriend.name} from your friends list? This action cannot be undone.`
            : 'Remove this friend from your friends list? This action cannot be undone.'
        }
        disabled={!pendingRemoveFriend}
        loading={isMutating}
        onCancel={closeRemoveModal}
        onConfirm={() => {
          void handleConfirmRemoveFriend();
        }}
        testID="friend-remove-confirm-modal"
        title="Remove Friend?"
        visible={pendingRemoveFriend !== null}
      />
    </TabRootScreenScaffold>
  );
}

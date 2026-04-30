import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import { FriendListItemCard } from '../components/friends';
import {
  ConfirmDestructiveModal,
  EmptyState,
  HeaderAccessoryButton,
  PendingQueuedWriteRow,
  ScreenContentSection,
  SegmentedControl,
  Skeleton,
  StatusPill,
  TabBrandHeader,
  TabRootScreenScaffold,
  type SegmentedControlOption,
} from '../components/shared';
import {
  acceptCachedFriendRequest,
  createFriendQrPayload,
  evictFriendshipDependentQueries,
  friendsQueryKeys,
  hydrateFriendsSummaryFromPaginatedData,
  listFriendsPage,
  markFriendInviteAccepted,
  removeCachedFriend,
  removeFriend,
  resolveOwnFriendCode,
  selectFriendsSummary,
  type FriendRecord,
} from '../features';
import { usePaginatedQueryState } from '../hooks/useListQueryState';
import { usePullToRefreshState } from '../hooks/usePullToRefreshState';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useQueuedFeatureWrites } from '../features/store/useQueuedFeatureWrites';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useLayoutChrome } from '../providers/LayoutChromeProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type FriendsScreenProps = NativeStackScreenProps<RootStackParamList, 'Friends'>;

type MainTab = 'my-code' | 'friends-list';
type FriendsSubTab = 'friends' | 'requests' | 'sent';
type FriendRemoveOperationName = 'friend.remove' | 'friend.request.reject' | 'friend.request.cancel';
type FriendActionName = 'accept' | 'reject' | 'cancel' | 'remove';

const FRIEND_ACTION_BY_OPERATION: Record<'friend.accept' | FriendRemoveOperationName, FriendActionName> = {
  'friend.accept': 'accept',
  'friend.remove': 'remove',
  'friend.request.reject': 'reject',
  'friend.request.cancel': 'cancel',
};

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
    flex: 1,
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  topBackdrop: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  list: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  listContent: {
    backgroundColor: theme.colors.background.app,
    flexGrow: 1,
    paddingBottom: theme.spacing.md,
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
  pendingStack: {
    gap: theme.spacing.sm,
  },
  cardsListSeparator: {
    height: theme.spacing.sm,
  },
  friendRow: {
    paddingHorizontal: theme.spacing.md,
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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }

  return date.toLocaleDateString();
}

export function FriendsScreen({ navigation, route }: FriendsScreenProps) {
  const theme = useTheme();
  const { topOverlayHeight } = useLayoutChrome();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();
  const { queuedWrites: pendingFriendRequestWrites } = useQueuedFeatureWrites([
    'friend.request.send',
  ]);

  const [mainTab, setMainTab] = useState<MainTab>('friends-list');
  const [friendsSubTab, setFriendsSubTab] = useState<FriendsSubTab>('friends');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [pendingRemoveFriend, setPendingRemoveFriend] = useState<FriendRecord | null>(null);
  const [topChromeHeight, setTopChromeHeight] = useState(0);
  const friendsQuery = useInfiniteQuery({
    queryKey: friendsQueryKeys.paginated(userId, friendsSubTab),
    queryFn: ({ pageParam, signal }) =>
      listFriendsPage({
        section: friendsSubTab,
        page: pageParam,
        pageSize: 20,
        signal,
      }),
    enabled: mainTab === 'friends-list' && Boolean(userId),
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
  const { isPullRefreshing, runPullRefresh } = usePullToRefreshState(friendsQuery.isRefetching);
  const visibleFriends = friendsState.items;
  const friendsSummary = selectFriendsSummary(friendsQuery.data);
  const acceptedFriendsCount =
    friendsSummary?.friendsCount ?? (friendsSubTab === 'friends' ? visibleFriends.length : 0);
  const pendingReceivedCount =
    friendsSummary?.requestsCount ?? (friendsSubTab === 'requests' ? visibleFriends.length : 0);
  const pendingSentCount =
    friendsSummary?.sentCount ?? (friendsSubTab === 'sent' ? visibleFriends.length : 0);

  useEffect(() => {
    hydrateFriendsSummaryFromPaginatedData(queryClient, userId, friendsQuery.data);
  }, [friendsQuery.data, queryClient, userId]);

  const myFriendCode = useMemo(
    () => resolveOwnFriendCode(user?.id, user?.friendCode),
    [user?.friendCode, user?.id],
  );
  const myFriendQrPayload = useMemo(
    () => createFriendQrPayload(myFriendCode),
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
  const buildBrowseAnalyticsPayload = (overrides?: Record<string, string | number | boolean | null>) => ({
    source: 'FriendsScreen',
    mainTab,
    friendsSubTab,
    resultCount: visibleFriends.length,
    ...overrides,
  });

  const invalidateFriends = async () => {
    await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
  };

  const invalidateFriendRemovalQueries = async (
    operationName: FriendRemoveOperationName,
    removedUserId?: string,
    options?: {
      preserveFriendsQueries?: boolean;
    },
  ) => {
    if (operationName === 'friend.remove') {
      await evictFriendshipDependentQueries(queryClient, {
        removedUserId,
        preserveFriendsQueries: options?.preserveFriendsQueries,
      });
      return;
    }

    await invalidateFriends();
  };

  const handleAccept = async (friend: FriendRecord) => {
    trackObservabilityEvent('FRIEND_ACTION_STARTED', {
      source: 'FriendsScreen',
      action: 'accept',
      isOnline,
      subTab: friendsSubTab,
    });
    setErrorMessage(null);
    setIsMutating(true);

    try {
      const acceptResult = await writeFeature({
        operationName: 'friend.accept',
        offline: {
          strategy: 'outbox',
          payload: { friendId: friend.id },
        },
        execute: () => markFriendInviteAccepted(friend.id),
      });

      acceptCachedFriendRequest(
        queryClient,
        userId,
        friend,
        acceptResult.status === 'queued' ? undefined : acceptResult.result,
      );

      if (acceptResult.status === 'queued') {
        await invalidateFriends();
        trackObservabilityEvent('FRIEND_ACTION_SUCCEEDED', {
          source: 'FriendsScreen',
          action: 'accept',
          queued: true,
          subTab: friendsSubTab,
        });
        showQueuedOfflineAlert({
          analyticsSource: 'FriendsScreen',
          subject: 'Friend action',
        });
        return;
      }

      await invalidateFriends();
      trackObservabilityEvent('FRIEND_ACTION_SUCCEEDED', {
        source: 'FriendsScreen',
        action: 'accept',
        queued: false,
        subTab: friendsSubTab,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not accept friend request.';
      trackObservabilityEvent('FRIEND_ACTION_FAILED', {
        source: 'FriendsScreen',
        action: 'accept',
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        isOnline,
        subTab: friendsSubTab,
      });
      setErrorMessage(message);
    } finally {
      setIsMutating(false);
    }
  };

  const handleRemove = async (
    friend: FriendRecord,
    operationName: FriendRemoveOperationName,
    removedUserId?: string,
  ) => {
    const action = FRIEND_ACTION_BY_OPERATION[operationName];
    trackObservabilityEvent('FRIEND_ACTION_STARTED', {
      source: 'FriendsScreen',
      action,
      isOnline,
      subTab: friendsSubTab,
    });
    setErrorMessage(null);
    setIsMutating(true);

    try {
      const removeResult = await writeFeature({
        operationName,
        offline: {
          strategy: 'outbox',
          payload: { friendId: friend.id },
        },
        execute: () => removeFriend(friend.id),
      });

      removeCachedFriend(queryClient, userId, friend);

      if (removeResult.status === 'queued') {
        await invalidateFriendRemovalQueries(operationName, removedUserId, {
          preserveFriendsQueries: true,
        });
        trackObservabilityEvent('FRIEND_ACTION_SUCCEEDED', {
          source: 'FriendsScreen',
          action,
          queued: true,
          subTab: friendsSubTab,
        });
        showQueuedOfflineAlert({
          analyticsSource: 'FriendsScreen',
          subject: 'Friend action',
        });
        return true;
      }

      await invalidateFriendRemovalQueries(operationName, removedUserId);
      trackObservabilityEvent('FRIEND_ACTION_SUCCEEDED', {
        source: 'FriendsScreen',
        action,
        queued: false,
        subTab: friendsSubTab,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update this friend entry.';
      trackObservabilityEvent('FRIEND_ACTION_FAILED', {
        source: 'FriendsScreen',
        action,
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        isOnline,
        subTab: friendsSubTab,
      });
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
    await runPullRefresh(async () => {
      const resultCountBefore = visibleFriends.length;
      trackObservabilityEvent('FRIENDS_REFRESH_STARTED', buildBrowseAnalyticsPayload({
        resultCountBefore,
      }));

      try {
        if (mainTab === 'friends-list') {
          const result = await friendsQuery.refetch();
          const resultCountAfter = result.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? resultCountBefore;
          trackObservabilityEvent('FRIENDS_REFRESH_COMPLETED', buildBrowseAnalyticsPayload({
            resultCountBefore,
            resultCountAfter,
            deltaCount: resultCountAfter - resultCountBefore,
          }));
          return;
        }

        trackObservabilityEvent('FRIENDS_REFRESH_COMPLETED', buildBrowseAnalyticsPayload({
          resultCountBefore,
          resultCountAfter: resultCountBefore,
          deltaCount: 0,
        }));
      } catch (error) {
        trackObservabilityEvent('FRIENDS_REFRESH_FAILED', buildBrowseAnalyticsPayload({
          resultCountBefore,
          errorType: error instanceof Error ? error.name : 'unknown_error',
        }));
        throw error;
      }
    });
  };

  const handleConfirmRemoveFriend = async () => {
    if (!pendingRemoveFriend) {
      return;
    }

    trackObservabilityEvent('FRIEND_REMOVE_CONFIRMED', {
      source: 'FriendsScreen',
    });
    const removed = await handleRemove(pendingRemoveFriend, 'friend.remove', pendingRemoveFriend.userId);
    if (removed) {
      setPendingRemoveFriend(null);
    }
  };

  const handleMainTabChange = (nextMainTab: MainTab) => {
    trackObservabilityEvent('FRIENDS_MAIN_TAB_CHANGED', {
      source: 'FriendsScreen',
      nextMainTab,
    });
    setMainTab(nextMainTab);
  };

  const handleFriendsSubTabChange = (nextFriendsSubTab: FriendsSubTab) => {
    trackObservabilityEvent('FRIENDS_SUB_TAB_CHANGED', {
      source: 'FriendsScreen',
      nextFriendsSubTab,
    });
    setFriendsSubTab(nextFriendsSubTab);
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

  const renderFriendItem = ({
    item: friend,
  }: {
    item: FriendRecord;
  }) => {
    if (friendsSubTab === 'friends') {
      return (
        <View style={styles.friendRow}>
          <FriendListItemCard
            iconColor={theme.colors.text.info}
            iconName="people-outline"
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
                  trackObservabilityEvent('FRIEND_REMOVE_TAPPED', {
                    source: 'FriendsScreen',
                  });
                  setPendingRemoveFriend(friend);
                }}
                style={styles.iconAction}
                testID={`friend-remove-button-${friend.id}`}
              >
                <Ionicons color={theme.colors.text.danger} name="trash-outline" size={18} />
              </Pressable>
            }
          />
        </View>
      );
    }

    if (friendsSubTab === 'requests') {
      return (
        <View style={styles.friendRow}>
          <FriendListItemCard
            iconColor={theme.colors.text.warning}
            iconName="person-add-outline"
            meta={`Sent ${formatDate(friend.createdAt)}`}
            name={friend.name}
            tone="warning"
            rightContent={
              <View style={styles.requestActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isMutating}
                  onPress={() => {
                    void handleAccept(friend);
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
                    void handleRemove(friend, 'friend.request.reject');
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
        </View>
      );
    }

    return (
      <View style={styles.friendRow}>
        <FriendListItemCard
          iconColor={theme.colors.text.secondary}
          iconName="time-outline"
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
                  void handleRemove(friend, 'friend.request.cancel');
                }}
                style={styles.textAction}
              >
                <Text style={styles.textActionMuted} variant="bodyBaseSemiBold">Cancel</Text>
              </Pressable>
            </View>
          }
        />
      </View>
    );
  };

  const friendsListHeader = (
    <>
      <View
        onLayout={(event) => {
          setTopChromeHeight(event.nativeEvent.layout.height);
        }}
      >
        <TabBrandHeader
          rightAccessory={
            <HeaderAccessoryButton
              accessibilityLabel="Add friend"
              label="Add Friend"
              onPress={() => {
                trackObservabilityEvent('FRIENDS_ADD_FRIEND_TAPPED', {
                  source: 'FriendsScreen',
                });
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
          <SegmentedControl onChange={handleMainTabChange} options={MAIN_TAB_OPTIONS} value={mainTab} />
        </View>
      </View>

      <View style={styles.body}>
        <PageErrorToast
          analyticsProps={buildBrowseAnalyticsPayload()}
          analyticsSource="FriendsScreen"
          errorMessage={errorMessage}
          title="Friend operation failed"
        />
        <PageErrorToast
          analyticsProps={buildBrowseAnalyticsPayload()}
          analyticsSource="FriendsScreen"
          errorMessage={friendsState.hasRefreshError ? 'Could not refresh friendship data. Showing saved data.' : null}
          title="Friends unavailable"
          actionLabel="Retry"
          onAction={() => {
            void friendsQuery.refetch();
          }}
        />

        {pendingFriendRequestWrites.length > 0 ? (
          <View style={styles.pendingStack}>
            <Text variant="label">Pending friend requests</Text>
            {pendingFriendRequestWrites.map((write) => {
              const payload = write.payload as { email?: string; friendCode?: string };
              return (
                <PendingQueuedWriteRow
                  key={write.id}
                  description={payload.email ?? payload.friendCode}
                  lastError={write.lastError}
                  status={write.status}
                  title="Send friend request"
                />
              );
            })}
          </View>
        ) : null}

        {mainTab === 'friends-list' ? (
          <SegmentedControl
            onChange={handleFriendsSubTabChange}
            options={friendsSubTabOptions}
            value={friendsSubTab}
          />
        ) : null}
      </View>
    </>
  );

  const friendsListEmptyComponent = (() => {
    if (mainTab === 'my-code') {
      return (
        <View style={styles.body}>
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
        </View>
      );
    }

    if (friendsQuery.isLoading) {
      return (
        <View style={styles.body}>
          <View style={styles.skeletonList}>
            <Skeleton height={110} />
            <Skeleton height={110} />
            <Skeleton height={110} />
          </View>
        </View>
      );
    }

    if (friendsState.hasBlockingError) {
      return (
        <View style={styles.body}>
          <EmptyState
            analyticsProps={buildBrowseAnalyticsPayload()}
            analyticsSource="FriendsScreen"
            description="Could not load friendship data."
            title="Friends unavailable"
          />
        </View>
      );
    }

    if (visibleFriends.length === 0) {
      return (
        <View style={styles.body}>
          {friendsSubTab === 'friends' ? (
            <EmptyState
              analyticsProps={buildBrowseAnalyticsPayload()}
              analyticsSource="FriendsScreen"
              description="Add friends to compare visits and food ratings."
              tone="default"
              title="No friends yet"
            />
          ) : friendsSubTab === 'requests' ? (
            <EmptyState
              analyticsProps={buildBrowseAnalyticsPayload()}
              analyticsSource="FriendsScreen"
              description="Incoming requests appear here."
              tone="default"
              title="No pending requests"
            />
          ) : (
            <EmptyState
              analyticsProps={buildBrowseAnalyticsPayload()}
              analyticsSource="FriendsScreen"
              description="Requests you send will show up here."
              tone="default"
              title="No sent requests"
            />
          )}
        </View>
      );
    }

    return null;
  })();

  const friendsListFooter =
    mainTab === 'friends-list' &&
    !friendsQuery.isLoading &&
    !friendsState.hasBlockingError &&
    visibleFriends.length > 0 &&
    friendsQuery.hasNextPage ? (
      <View style={styles.body}>
        <Button
          label={friendsQuery.isFetchingNextPage ? 'Loading more...' : 'Load more'}
          loading={friendsQuery.isFetchingNextPage}
          onPress={() => {
            const resultCountBefore = visibleFriends.length;
            trackObservabilityEvent('FRIENDS_LOAD_MORE_STARTED', buildBrowseAnalyticsPayload({
              resultCountBefore,
            }));
            void friendsQuery.fetchNextPage()
              .then((result) => {
                const resultCountAfter =
                  result.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? resultCountBefore;
                trackObservabilityEvent('FRIENDS_LOAD_MORE_COMPLETED', buildBrowseAnalyticsPayload({
                  resultCountBefore,
                  resultCountAfter,
                  deltaCount: resultCountAfter - resultCountBefore,
                }));
              })
              .catch((error) => {
                trackObservabilityEvent('FRIENDS_LOAD_MORE_FAILED', buildBrowseAnalyticsPayload({
                  resultCountBefore,
                  errorType: error instanceof Error ? error.name : 'unknown_error',
                }));
              });
          }}
          variant="secondary"
        />
      </View>
    ) : null;

  return (
    <TabRootScreenScaffold
      contentStyle={styles.screenContent}
      keyboardAware
      scroll={false}
      scrollUnderlayColor={theme.colors.background.app}
      testID="friends-screen"
    >
      <View
        pointerEvents="none"
        style={[
          styles.topBackdrop,
          {
            backgroundColor: theme.colors.background.surface,
            height: topChromeHeight + topOverlayHeight,
          },
        ]}
        testID="friends-screen-top-backdrop"
      />
      <ScreenContentSection
        fill
        overscrollBackgroundSplit={{
          bottomColor: theme.colors.background.app,
          topColor: theme.colors.background.surface,
          topRatio: 0.6,
        }}
        testID="friends-screen-records-section"
      >
        <FlatList
          contentContainerStyle={styles.listContent}
          data={
            mainTab === 'friends-list' && !friendsQuery.isLoading && !friendsState.hasBlockingError
              ? visibleFriends
              : []
          }
          ItemSeparatorComponent={() => <View style={styles.cardsListSeparator} />}
          keyExtractor={(friend) => friend.id}
          ListEmptyComponent={friendsListEmptyComponent}
          ListFooterComponent={friendsListFooter}
          ListHeaderComponent={friendsListHeader}
          onRefresh={mainTab === 'friends-list' ? handleRefresh : undefined}
          refreshing={mainTab === 'friends-list' ? isPullRefreshing : false}
          removeClippedSubviews
          renderItem={renderFriendItem}
          style={styles.list}
        />
      </ScreenContentSection>

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

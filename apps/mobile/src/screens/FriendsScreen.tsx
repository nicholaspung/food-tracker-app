import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';

import { FriendListItemCard } from '../components/friends';
import {
  ConfirmDestructiveModal,
  EmptyState,
  FeatureListFooter,
  HeaderAccessoryButton,
  ScreenContentSection,
  SegmentedControl,
  Skeleton,
  StatusPill,
  TabBrandHeader,
  TabRootScreenScaffold,
  type SegmentedControlOption,
} from '../components/shared';
import {
  createFriendQrPayload,
  friendsQueryKeys,
  hydrateFriendsSummaryFromPaginatedData,
  listFriendsPage,
  resolveOwnFriendCode,
  selectFriendsSummary,
  useFriendWrites,
  type FriendRecord,
} from '../features';
import type { FriendsPageResult } from '../features/store/friendsStore';
import { useFeatureBrowse } from '../features/store/useFeatureBrowse';
import { useQueuedFeatureWrites } from '../features/store/useQueuedFeatureWrites';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { trackProductEvent } from '../observability/productAnalytics';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useLayoutChrome } from '../providers/LayoutChromeProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import { FriendCodePanel } from './friends/FriendCodePanel';
import { FriendsPendingRequestsSection } from './friends/FriendsPendingRequestsSection';
import { formatDate } from './friends/friendsFormatters';
import {
  FRIEND_ACTION_BY_OPERATION,
  type FriendRemoveOperationName,
  type FriendsSubTab,
  type MainTab,
} from './friends/friendsScreenTypes';

type FriendsScreenProps = NativeStackScreenProps<RootStackParamList, 'Friends'>;
type FriendsInfiniteData = InfiniteData<FriendsPageResult, unknown>;

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

export function FriendsScreen({ navigation, route }: FriendsScreenProps) {
  const theme = useTheme();
  const { topOverlayHeight } = useLayoutChrome();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const friendWrites = useFriendWrites();
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
  const getFriendsItemsFromData = useCallback(
    (data: FriendsInfiniteData | undefined) => data?.pages.flatMap((page) => page.items) ?? [],
    [],
  );
  const friendsResultCount = useMemo(
    () => getFriendsItemsFromData(friendsQuery.data).length,
    [friendsQuery.data, getFriendsItemsFromData],
  );
  const friendsSummary = selectFriendsSummary(friendsQuery.data);
  const acceptedFriendsCount =
    friendsSummary?.friendsCount ?? (friendsSubTab === 'friends' ? friendsResultCount : 0);
  const pendingReceivedCount =
    friendsSummary?.requestsCount ?? (friendsSubTab === 'requests' ? friendsResultCount : 0);
  const pendingSentCount =
    friendsSummary?.sentCount ?? (friendsSubTab === 'sent' ? friendsResultCount : 0);

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
  const buildBrowseAnalyticsPayload = useCallback((overrides?: Record<string, string | number | boolean | null>) => ({
    source: 'FriendsScreen',
    mainTab,
    friendsSubTab,
    resultCount: friendsResultCount,
    ...overrides,
  }), [friendsResultCount, friendsSubTab, mainTab]);
  const browseState = useFeatureBrowse({
    analyticsSource: 'FriendsScreen',
    buildAnalyticsPayload: buildBrowseAnalyticsPayload,
    enabled: mainTab === 'friends-list',
    getHasCachedData: (data) => (data?.pages.length ?? 0) > 0,
    getItemsFromData: getFriendsItemsFromData,
    getResultCountFromData: (data, fallbackCount) =>
      data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? fallbackCount,
    getTotalItemsFromData: (data, items) => data?.pages[0]?.totalItems ?? items.length,
    loadMoreEventPrefix: 'FRIENDS_LOAD_MORE',
    query: friendsQuery,
    refreshEventPrefix: 'FRIENDS_REFRESH',
    resultCount: friendsResultCount,
  });
  const visibleFriends = browseState.items;

  useEffect(() => {
    if (mainTab !== 'friends-list') {
      return;
    }

    trackProductEvent('social.feed_viewed', {
      source: 'FriendsScreen',
      friendsSubTab,
      resultCount: visibleFriends.length,
    });
  }, [friendsSubTab, mainTab, visibleFriends.length]);

  useEffect(() => {
    if (mainTab !== 'my-code') {
      return;
    }

    trackProductEvent('social.friend_code_viewed', {
      source: 'FriendsScreen',
    });
  }, [mainTab]);

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
      const acceptResult = await friendWrites.acceptFriendRequest({
        friend,
        userId,
      });

      if (acceptResult.status === 'queued') {
        trackObservabilityEvent('FRIEND_ACTION_SUCCEEDED', {
          source: 'FriendsScreen',
          action: 'accept',
          queued: true,
          subTab: friendsSubTab,
        });
        trackProductEvent('social.friend_added', {
          source: 'FriendsScreen',
          queued: true,
        });
        return;
      }

      trackObservabilityEvent('FRIEND_ACTION_SUCCEEDED', {
        source: 'FriendsScreen',
        action: 'accept',
        queued: false,
        subTab: friendsSubTab,
      });
      trackProductEvent('social.friend_added', {
        source: 'FriendsScreen',
        queued: false,
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
      const removeResult = await friendWrites.removeFriend({
        friend,
        operationName,
        removedUserId,
        userId,
      });

      if (removeResult.status === 'queued') {
        trackObservabilityEvent('FRIEND_ACTION_SUCCEEDED', {
          source: 'FriendsScreen',
          action,
          queued: true,
          subTab: friendsSubTab,
        });
        return true;
      }

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
      trackProductEvent('social.invite_shared', {
        source: 'FriendsScreen',
        shareMethod: 'friend_code_copy',
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
          errorMessage={browseState.hasRefreshError ? 'Could not refresh friendship data. Showing saved data.' : null}
          title="Friends unavailable"
          actionLabel="Retry"
          onAction={() => {
            void friendsQuery.refetch();
          }}
        />

        <FriendsPendingRequestsSection
          pendingWrites={pendingFriendRequestWrites}
          styles={styles}
        />

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
          <FriendCodePanel
            code={myFriendCode}
            onCopy={() => {
              void handleCopyFriendCode();
            }}
            qrPayload={myFriendQrPayload}
            styles={styles}
          />
        </View>
      );
    }

    if (browseState.isLoading) {
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

    if (browseState.hasBlockingError) {
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
    !browseState.isLoading &&
    !browseState.hasBlockingError &&
    visibleFriends.length > 0 &&
    browseState.hasNextPage ? (
      <FeatureListFooter
        isFetchingNextPage={browseState.isFetchingNextPage}
        label="Load more"
        onLoadMore={browseState.onEndReached}
      />
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
            mainTab === 'friends-list' && !browseState.isLoading && !browseState.hasBlockingError
              ? visibleFriends
              : []
          }
          ItemSeparatorComponent={() => <View style={styles.cardsListSeparator} />}
          keyExtractor={(friend) => friend.id}
          ListEmptyComponent={friendsListEmptyComponent}
          ListFooterComponent={friendsListFooter}
          ListHeaderComponent={friendsListHeader}
          onRefresh={mainTab === 'friends-list' ? browseState.onRefresh : undefined}
          refreshing={mainTab === 'friends-list' ? browseState.isRefreshing : false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
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

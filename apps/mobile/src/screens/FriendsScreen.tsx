import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import { FriendListItemCard } from '../components/friends';
import {
  EmptyState,
  SegmentedControl,
  Skeleton,
  StatusPill,
  TabBrandHeader,
  TabRootScreenScaffold,
  type SegmentedControlOption,
} from '../components/shared';
import { inviteFriend, listFriends, markFriendInviteAccepted, removeFriend } from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type FriendsScreenProps = NativeStackScreenProps<RootStackParamList, 'Friends'>;

type MainTab = 'my-code' | 'friends-list' | 'add-friend';
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
  {
    label: 'Add Friend',
    value: 'add-friend',
  },
];

function generateFriendCode(userId: string | undefined): string {
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

export function FriendsScreen({ navigation }: FriendsScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();

  const friendsQuery = useQuery({
    queryKey: ['feature', 'friends'],
    queryFn: listFriends,
  });
  const hasBlockingFriendsError = friendsQuery.isError && !friendsQuery.data;
  const hasFriendsRefreshError = !hasBlockingFriendsError && friendsQuery.isError;

  const [mainTab, setMainTab] = useState<MainTab>('friends-list');
  const [friendsSubTab, setFriendsSubTab] = useState<FriendsSubTab>('friends');
  const [friendCode, setFriendCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const { acceptedFriends, pendingReceived, pendingSent } = useMemo(() => {
    const friends = friendsQuery.data ?? [];

    return {
      acceptedFriends: friends.filter((friend) => friend.status === 'friend'),
      pendingReceived: friends.filter((friend) => friend.status === 'pending_received'),
      pendingSent: friends.filter((friend) => friend.status === 'pending_sent'),
    };
  }, [friendsQuery.data]);

  const myFriendCode = useMemo(() => generateFriendCode(user?.id), [user?.id]);
  const myFriendQrPayload = useMemo(
    () => `yummyrecs://friends/add?friendCode=${encodeURIComponent(myFriendCode)}`,
    [myFriendCode],
  );

  const friendSummary = `${acceptedFriends.length} friend${acceptedFriends.length === 1 ? '' : 's'}`;
  const friendsSubTabOptions = useMemo<readonly SegmentedControlOption<FriendsSubTab>[]>(
    () => [
      {
        label: 'Friends',
        value: 'friends',
        badgeCount: acceptedFriends.length,
      },
      {
        label: 'Requests',
        value: 'requests',
        badgeCount: pendingReceived.length,
        badgeTone: 'alert',
      },
      {
        label: 'Sent',
        value: 'sent',
        badgeCount: pendingSent.length,
      },
    ],
    [acceptedFriends.length, pendingReceived.length, pendingSent.length],
  );

  const styles = StyleSheet.create({
    screenContent: {
      backgroundColor: theme.colors.background.muted,
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
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
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
      fontSize: 26,
      fontWeight: '700',
      letterSpacing: 3,
      lineHeight: 30,
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
    rowActions: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    rowAction: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 22,
    },
    cardsList: {
      gap: theme.spacing.sm,
    },
    textAction: {
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: theme.spacing.xxs,
    },
    textActionDanger: {
      color: theme.colors.text.danger,
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
    },
    textActionMuted: {
      color: theme.colors.text.secondary,
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
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
    actionPillLabel: {
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 16,
    },
    actionPillSuccessLabel: {
      color: theme.colors.text.success,
    },
    actionPillDangerLabel: {
      color: theme.colors.text.danger,
    },
    skeletonList: {
      gap: theme.spacing.sm,
    },
  });

  const invalidateFriends = async () => {
    await queryClient.invalidateQueries({ queryKey: ['feature', 'friends'] });
  };

  const handleAccept = async (friendId: string) => {
    setErrorMessage(null);
    setIsMutating(true);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('friend.accept', { friendId });
        await invalidateFriends();
        showQueuedOfflineAlert('Friend action');
        return;
      }

      await queueWrite('friend.accept');
      await markFriendInviteAccepted(friendId);
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
      if (!isOnline) {
        await queueFeatureOutbox(operationName, { friendId });
        await invalidateFriends();
        showQueuedOfflineAlert('Friend action');
        return;
      }

      await queueWrite(operationName);
      await removeFriend(friendId);
      await invalidateFriends();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update this friend entry.';
      setErrorMessage(message);
    } finally {
      setIsMutating(false);
    }
  };

  const handleSendRequest = async () => {
    const normalizedCode = friendCode.trim().toUpperCase();
    if (!normalizedCode) {
      setErrorMessage('Friend code is required.');
      return;
    }

    if (normalizedCode === myFriendCode) {
      setErrorMessage('You cannot add yourself as a friend.');
      return;
    }

    setErrorMessage(null);
    setIsMutating(true);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('friend.request.send', { code: normalizedCode });
        setFriendCode('');
        setMainTab('friends-list');
        setFriendsSubTab('sent');
        await invalidateFriends();
        showQueuedOfflineAlert('Friend request');
        return;
      }

      await queueWrite('friend.request.send');
      await inviteFriend({
        code: normalizedCode,
      });
      setFriendCode('');
      setMainTab('friends-list');
      setFriendsSubTab('sent');
      await invalidateFriends();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send friend request.';
      setErrorMessage(message);
    } finally {
      setIsMutating(false);
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

    if (hasBlockingFriendsError) {
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

    if (friendsSubTab === 'friends') {
      if (acceptedFriends.length === 0) {
        return (
          <EmptyState
            description="Add friends to compare visits and food ratings."
            title="No friends yet"
          />
        );
      }

      return (
        <View style={styles.cardsList}>
          {acceptedFriends.map((friend) => (
            <FriendListItemCard
              iconColor={theme.colors.text.info}
              iconName="people-outline"
              key={friend.id}
              meta={`Friends since ${formatDate(friend.createdAt)}`}
              name={friend.name}
              tone="info"
              rightContent={
                <Pressable
                  accessibilityRole="button"
                  disabled={isMutating}
                  onPress={() => {
                    void handleRemove(friend.id, 'friend.remove');
                  }}
                  style={styles.textAction}
                >
                  <Text style={styles.textActionDanger}>Remove</Text>
                </Pressable>
              }
            />
          ))}
        </View>
      );
    }

    if (friendsSubTab === 'requests') {
      if (pendingReceived.length === 0) {
        return <EmptyState description="Incoming requests appear here." title="No pending requests" />;
      }

      return (
        <View style={styles.cardsList}>
          {pendingReceived.map((friend) => (
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
                    <Text style={[styles.actionPillLabel, styles.actionPillSuccessLabel]}>Accept</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isMutating}
                    onPress={() => {
                      void handleRemove(friend.id, 'friend.request.reject');
                    }}
                    style={[styles.actionPill, styles.actionPillDanger]}
                  >
                    <Text style={[styles.actionPillLabel, styles.actionPillDangerLabel]}>Decline</Text>
                  </Pressable>
                </View>
              }
            />
          ))}
        </View>
      );
    }

    if (pendingSent.length === 0) {
      return <EmptyState description="Requests you send will show up here." title="No sent requests" />;
    }

    return (
      <View style={styles.cardsList}>
        {pendingSent.map((friend) => (
          <FriendListItemCard
            iconColor={theme.colors.text.secondary}
            iconName="time-outline"
            key={friend.id}
            meta={friend.email}
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
                  <Text style={styles.textActionMuted}>Cancel</Text>
                </Pressable>
              </View>
            }
          />
        ))}
      </View>
    );
  };

  return (
    <TabRootScreenScaffold
      contentStyle={styles.screenContent}
      keyboardAware
      scrollUnderlayColor={theme.colors.background.muted}
    >
      <TabBrandHeader showBrand={false} subtitle={friendSummary} title="Friends" titleVariant="displayLg" />

      <View style={styles.mainTabsSection}>
        <SegmentedControl onChange={setMainTab} options={MAIN_TAB_OPTIONS} value={mainTab} />
      </View>

      <View style={styles.body}>
        <PageErrorToast errorMessage={errorMessage} title="Friend operation failed" />
        <PageErrorToast
          errorMessage={hasFriendsRefreshError ? 'Could not refresh friendship data. Showing saved data.' : null}
          title="Friends unavailable"
          actionLabel="Retry"
          onAction={() => {
            void friendsQuery.refetch();
          }}
        />

        {mainTab === 'my-code' ? (
          <Card>
            <Text style={styles.cardTitle}>My Friend Code</Text>
            <Text style={styles.cardDescription}>Share this code so friends can send you a request.</Text>
            <View style={styles.codeBox}>
              <View style={styles.codeHeaderRow}>
                <Text style={styles.codeLabel}>Friend Code</Text>
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
              <Text style={styles.codeText}>{myFriendCode}</Text>
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

        {mainTab === 'add-friend' ? (
          <Card>
            <Text style={styles.cardTitle}>Add Friend</Text>
            <Text style={styles.cardDescription}>Enter a friend code or scan a QR code to send a request.</Text>
            <Input
              autoCapitalize="characters"
              autoCorrect={false}
              keyboardType="ascii-capable"
              label="Friend Code"
              maxLength={8}
              onChangeText={(value) => {
                const sanitized = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                setFriendCode(sanitized);
              }}
              placeholder="Enter 8-character code"
              value={friendCode}
            />
            <View style={styles.rowActions}>
              <Button
                disabled={!friendCode.trim() || isMutating}
                label={isMutating ? 'Sending...' : 'Send Request'}
                onPress={() => {
                  void handleSendRequest();
                }}
                style={styles.rowAction}
              />
              <Button
                label="Scan QR"
                onPress={() => {
                  navigation.navigate('QRScanner');
                }}
                style={styles.rowAction}
                variant="secondary"
              />
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
    </TabRootScreenScaffold>
  );
}

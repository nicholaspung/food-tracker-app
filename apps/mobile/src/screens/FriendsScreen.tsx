import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, Skeleton } from '../components/shared';
import { inviteFriend, listFriends, markFriendInviteAccepted, removeFriend } from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';

type FriendsScreenProps = NativeStackScreenProps<RootStackParamList, 'Friends'>;

type MainTab = 'my-code' | 'friends-list' | 'add-friend';
type FriendsSubTab = 'friends' | 'requests' | 'sent';

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

  const friendsQuery = useQuery({
    queryKey: ['feature', 'friends'],
    queryFn: listFriends,
  });

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

  const friendSummary = `${acceptedFriends.length} friend${acceptedFriends.length === 1 ? '' : 's'}`;

  const styles = StyleSheet.create({
    screenContent: {
      backgroundColor: theme.colors.background.muted,
      gap: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    header: {
      backgroundColor: theme.colors.background.surface,
      gap: theme.spacing.xs,
      paddingBottom: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.md,
    },
    mainTabsSection: {
      backgroundColor: theme.colors.background.surface,
      borderBottomColor: theme.colors.border.subtle,
      borderBottomWidth: 1,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    title: {
      color: theme.colors.text.primary,
      fontSize: 38,
      fontWeight: '700',
      lineHeight: 44,
    },
    subtitle: {
      color: theme.colors.text.muted,
      fontSize: 14,
      lineHeight: 20,
    },
    body: {
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      paddingBottom: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    segmentedControl: {
      backgroundColor: theme.colors.background.app,
      borderColor: theme.colors.border.default,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      padding: 2,
    },
    segmentButton: {
      alignItems: 'center',
      borderRadius: 9,
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      minHeight: 36,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 7,
    },
    segmentButtonActive: {
      backgroundColor: theme.colors.background.surface,
      shadowColor: theme.colors.background.inverse,
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.08,
      shadowRadius: 1,
    },
    segmentLabel: {
      color: theme.colors.text.muted,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 18,
    },
    segmentLabelActive: {
      color: theme.colors.text.primary,
    },
    segmentBadge: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.muted,
      borderRadius: theme.radii.pill,
      justifyContent: 'center',
      marginLeft: 6,
      minWidth: 20,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    segmentBadgeAlert: {
      backgroundColor: theme.colors.text.danger,
    },
    segmentBadgeLabel: {
      color: theme.colors.text.secondary,
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 14,
    },
    segmentBadgeLabelAlert: {
      color: theme.colors.text.inverse,
    },
    cardDescription: {
      color: theme.colors.text.secondary,
    },
    codeBox: {
      alignItems: 'center',
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
    codeText: {
      color: theme.colors.text.info,
      fontSize: 26,
      fontWeight: '700',
      letterSpacing: 3,
      lineHeight: 30,
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
    friendCard: {
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
    },
    friendRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.sm,
      justifyContent: 'space-between',
    },
    friendIdentity: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    avatar: {
      alignItems: 'center',
      borderRadius: theme.radii.pill,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    avatarFriend: {
      backgroundColor: theme.colors.status.infoBg,
    },
    avatarRequest: {
      backgroundColor: theme.colors.status.warningBg,
    },
    avatarSent: {
      backgroundColor: theme.colors.background.muted,
    },
    friendMetaWrap: {
      flex: 1,
      gap: 2,
    },
    friendName: {
      color: theme.colors.text.primary,
      fontSize: 20,
      fontWeight: '700',
      lineHeight: 24,
    },
    friendMeta: {
      color: theme.colors.text.muted,
      fontSize: 13,
      lineHeight: 18,
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
    requestLabel: {
      color: theme.colors.text.warning,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
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

  const handleRemove = async (friendId: string, operationName: string) => {
    setErrorMessage(null);
    setIsMutating(true);

    try {
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

  const renderBadge = (count: number, tone: 'default' | 'alert' = 'default') => {
    if (count <= 0) {
      return null;
    }

    return (
      <View style={[styles.segmentBadge, tone === 'alert' && styles.segmentBadgeAlert]}>
        <Text style={[styles.segmentBadgeLabel, tone === 'alert' && styles.segmentBadgeLabelAlert]}>
          {count > 9 ? '9+' : count}
        </Text>
      </View>
    );
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

    if (friendsQuery.isError) {
      return (
        <ErrorState
          description="Could not load friendship data."
          onRetry={() => {
            void friendsQuery.refetch();
          }}
          title="Friends unavailable"
        />
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
            <Card key={friend.id} style={styles.friendCard}>
              <View style={styles.friendRow}>
                <View style={styles.friendIdentity}>
                  <View style={[styles.avatar, styles.avatarFriend]}>
                    <Ionicons color={theme.colors.text.info} name="people-outline" size={18} />
                  </View>
                  <View style={styles.friendMetaWrap}>
                    <Text style={styles.friendName}>{friend.name}</Text>
                    <Text style={styles.friendMeta}>Friends since {formatDate(friend.createdAt)}</Text>
                  </View>
                </View>
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
              </View>
            </Card>
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
            <Card key={friend.id} style={styles.friendCard}>
              <View style={styles.friendRow}>
                <View style={styles.friendIdentity}>
                  <View style={[styles.avatar, styles.avatarRequest]}>
                    <Ionicons color={theme.colors.text.warning} name="person-add-outline" size={18} />
                  </View>
                  <View style={styles.friendMetaWrap}>
                    <Text style={styles.friendName}>{friend.name}</Text>
                    <Text style={styles.friendMeta}>Sent {formatDate(friend.createdAt)}</Text>
                  </View>
                </View>
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
              </View>
            </Card>
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
          <Card key={friend.id} style={styles.friendCard}>
            <View style={styles.friendRow}>
              <View style={styles.friendIdentity}>
                <View style={[styles.avatar, styles.avatarSent]}>
                  <Ionicons color={theme.colors.text.secondary} name="time-outline" size={18} />
                </View>
                <View style={styles.friendMetaWrap}>
                  <Text style={styles.friendName}>{friend.name}</Text>
                  <Text style={styles.friendMeta}>{friend.email}</Text>
                </View>
              </View>
              <View>
                <Text style={styles.requestLabel}>Pending</Text>
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
            </View>
          </Card>
        ))}
      </View>
    );
  };

  return (
    <Screen background="surface" contentStyle={styles.screenContent} edges={['top']} keyboardAware scroll>
      <View style={styles.header}>
        <Text style={styles.title}>Friends</Text>
        <Text style={styles.subtitle}>{friendSummary}</Text>
      </View>

      <View style={styles.mainTabsSection}>
        <View style={styles.segmentedControl}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMainTab('my-code');
            }}
            style={({ pressed }) => [
              styles.segmentButton,
              mainTab === 'my-code' && styles.segmentButtonActive,
              pressed && mainTab !== 'my-code' ? { opacity: 0.75 } : null,
            ]}
          >
            <Text style={[styles.segmentLabel, mainTab === 'my-code' && styles.segmentLabelActive]}>My Code</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMainTab('friends-list');
            }}
            style={({ pressed }) => [
              styles.segmentButton,
              mainTab === 'friends-list' && styles.segmentButtonActive,
              pressed && mainTab !== 'friends-list' ? { opacity: 0.75 } : null,
            ]}
          >
            <Text style={[styles.segmentLabel, mainTab === 'friends-list' && styles.segmentLabelActive]}>
              Friends
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMainTab('add-friend');
            }}
            style={({ pressed }) => [
              styles.segmentButton,
              mainTab === 'add-friend' && styles.segmentButtonActive,
              pressed && mainTab !== 'add-friend' ? { opacity: 0.75 } : null,
            ]}
          >
            <Text style={[styles.segmentLabel, mainTab === 'add-friend' && styles.segmentLabelActive]}>Add Friend</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        {errorMessage ? <ErrorState description={errorMessage} title="Friend operation failed" /> : null}

        {mainTab === 'my-code' ? (
          <Card>
            <Text style={styles.cardTitle}>My Friend Code</Text>
            <Text style={styles.cardDescription}>Share this code so friends can send you a request.</Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>Friend Code</Text>
              <Text style={styles.codeText}>{myFriendCode}</Text>
            </View>
            <View style={styles.rowActions}>
              <Button
                label="Invite + QR"
                onPress={() => {
                  navigation.navigate('Invite');
                }}
                style={styles.rowAction}
                variant="secondary"
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
            <View style={styles.segmentedControl}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFriendsSubTab('friends');
                }}
                style={({ pressed }) => [
                  styles.segmentButton,
                  friendsSubTab === 'friends' && styles.segmentButtonActive,
                  pressed && friendsSubTab !== 'friends' ? { opacity: 0.75 } : null,
                ]}
              >
                <Text style={[styles.segmentLabel, friendsSubTab === 'friends' && styles.segmentLabelActive]}>
                  Friends
                </Text>
                {renderBadge(acceptedFriends.length)}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFriendsSubTab('requests');
                }}
                style={({ pressed }) => [
                  styles.segmentButton,
                  friendsSubTab === 'requests' && styles.segmentButtonActive,
                  pressed && friendsSubTab !== 'requests' ? { opacity: 0.75 } : null,
                ]}
              >
                <Text style={[styles.segmentLabel, friendsSubTab === 'requests' && styles.segmentLabelActive]}>
                  Requests
                </Text>
                {renderBadge(pendingReceived.length, 'alert')}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFriendsSubTab('sent');
                }}
                style={({ pressed }) => [
                  styles.segmentButton,
                  friendsSubTab === 'sent' && styles.segmentButtonActive,
                  pressed && friendsSubTab !== 'sent' ? { opacity: 0.75 } : null,
                ]}
              >
                <Text style={[styles.segmentLabel, friendsSubTab === 'sent' && styles.segmentLabelActive]}>Sent</Text>
                {renderBadge(pendingSent.length)}
              </Pressable>
            </View>

            {renderFriendsTabContent()}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

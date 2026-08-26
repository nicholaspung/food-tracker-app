import { Fragment, useEffect, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { Ionicons } from '../ui/AppIcon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  ConfirmDestructiveModal,
  FeatureDetailScreenScaffold,
  PageErrorToast,
  StatusPill,
  StepProgressBar,
} from '../components/shared';
import {
  type TastingInviteRecord,
  type TastingParticipantRecord,
  usePendingTastingSessionLifecycleWrites,
  useTastingSessionLifecycleWrites,
} from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Input, ListItem, Modal, Text } from '../ui';
import {
  formatCountdown,
  getTastingInviteDisplayStatus,
  isTastingInviteWindowExpired,
  isTastingInviteWindowOpen,
  TASTING_SESSION_LIFECYCLE_STEPS,
} from './tastingSessions/shared';
import { TastingJoinWindowDurationSelector } from './tastingSessions/TastingJoinWindowDurationSelector';
import { TastingSessionLifecycleShell } from './tastingSessions/TastingSessionLifecycleShell';
import { useTastingSessionLifecycleNavigation } from './tastingSessions/useTastingSessionLifecycleNavigation';
import { useTastingSessionLifecycleReadState } from './tastingSessions/useTastingSessionLifecycleReadState';

type TastingSessionLobbyScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessionLobby'>;

const useStyles = createThemedStyles((theme) => ({
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionStack: {
    gap: theme.spacing.sm,
  },
  action: {
    flex: 1,
  },
  headerIconButton: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  rowIconButton: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  destructiveIconButtonPressed: {
    opacity: 0.7,
  },
  iconButtonDisabled: {
    opacity: 0.5,
  },
  statusBadge: {
    alignSelf: 'flex-start',
  },
  sectionCard: {
    gap: theme.spacing.sm,
  },
  lobbyList: {
    gap: 0,
  },
  lobbyListItem: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
  },
  lobbyListSeparator: {
    backgroundColor: theme.colors.border.subtle,
    height: 1,
  },
  lobbySearchInput: {
    marginTop: theme.spacing.xs,
  },
}));

function getParticipantRoleBadge(participant: TastingParticipantRecord) {
  return participant.role === 'leader'
    ? { label: 'Leader', tone: 'brand' as const }
    : { label: 'Joined', tone: 'success' as const };
}

function getInviteStatusBadge(status: TastingInviteRecord['status'] | 'expired') {
  if (status === 'accepted') {
    return { label: 'Accepted', tone: 'success' as const };
  }

  if (status === 'dismissed') {
    return { label: 'Dismissed', tone: 'muted' as const };
  }

  if (status === 'revoked') {
    return { label: 'Revoked', tone: 'danger' as const };
  }

  if (status === 'expired') {
    return { label: 'Expired', tone: 'muted' as const };
  }

  return { label: 'Pending', tone: 'warning' as const };
}

function matchesLobbySearch(value: string | undefined, query: string): boolean {
  return Boolean(value?.toLowerCase().includes(query));
}

export function TastingSessionLobbyScreen({ navigation, route }: TastingSessionLobbyScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { sessionId } = route.params;
  const { user } = useAuth();
  const tastingSessionWrites = useTastingSessionLifecycleWrites();
  const pendingTastingSessionWrites = usePendingTastingSessionLifecycleWrites();
  const lifecycle = useTastingSessionLifecycleReadState({
    currentUserId: user?.id,
    screen: 'lobby',
    sessionId,
  });
  const sessionQuery = lifecycle.query;
  const isOnline = lifecycle.onlineOnly.isOnline;
  const [pendingKick, setPendingKick] = useState<TastingParticipantRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReopenModalVisible, setIsReopenModalVisible] = useState(false);
  const [reopenDuration, setReopenDuration] = useState<number>(60);
  const [isReopeningInviteWindow, setIsReopeningInviteWindow] = useState(false);
  const [isDeleteSessionModalVisible, setIsDeleteSessionModalVisible] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [isLeaveSessionModalVisible, setIsLeaveSessionModalVisible] = useState(false);
  const [isLeavingSession, setIsLeavingSession] = useState(false);
  const [isLockingLobby, setIsLockingLobby] = useState(false);
  const [didQueuePlanning, setDidQueuePlanning] = useState(false);
  const [participantSearchQuery, setParticipantSearchQuery] = useState('');

  const session = sessionQuery.data;
  const isLeader = lifecycle.roles.isLeader;
  const isParticipant = lifecycle.roles.isParticipant;
  const planningQueueState = pendingTastingSessionWrites.getStatusState(sessionId, 'planning');
  const isPlanningPending = didQueuePlanning || planningQueueState.status === 'pending';

  useEffect(() => {
    if (didQueuePlanning && planningQueueState.status !== 'idle') {
      setDidQueuePlanning(false);
    }
  }, [didQueuePlanning, planningQueueState.status]);
  const inviteWindowOpen = session ? isTastingInviteWindowOpen(session.joinExpiresAt) : false;
  const inviteWindowExpired = session ? isTastingInviteWindowExpired(session.joinExpiresAt) : false;
  const lobbyInstruction = isLeader
    ? 'Invite people, share the code, and start planning when the group is ready.'
    : 'You are in the lobby. Wait for the leader to lock the group and start planning.';
  const normalizedParticipantSearchQuery = participantSearchQuery.trim().toLowerCase();
  const filteredParticipants = session && normalizedParticipantSearchQuery
    ? session.participants.filter((participant) =>
        matchesLobbySearch(participant.name, normalizedParticipantSearchQuery) ||
        matchesLobbySearch(participant.role, normalizedParticipantSearchQuery),
      )
    : session?.participants ?? [];
  const filteredInvites = session && normalizedParticipantSearchQuery
    ? session.invites.filter((invite) => {
        const inviteStatus = getTastingInviteDisplayStatus(invite, session);

        return (
          matchesLobbySearch(invite.invitedUserName, normalizedParticipantSearchQuery) ||
          matchesLobbySearch(inviteStatus, normalizedParticipantSearchQuery)
        );
      })
    : session?.invites ?? [];

  useTastingSessionLifecycleNavigation({
    applyMissingAccessPolicy: lifecycle.applyMissingAccessPolicy,
    missingAccess: lifecycle.missingAccess,
    navigation,
    redirectDestination: lifecycle.redirectDestination,
  });

  const handleShare = async () => {
    if (!session?.inviteCode || !inviteWindowOpen) {
      return;
    }
    await Share.share({ message: `Join my group tasting with code: ${session.inviteCode}` });
  };

  const handleLock = async () => {
    if (isPlanningPending || isLockingLobby) {
      return;
    }
    try {
      setErrorMessage(null);
      setIsLockingLobby(true);
      const lockResult = await tastingSessionWrites.lockLobby({ sessionId });
      if (lockResult.status === 'blocked') {
        setErrorMessage(lockResult.message);
        return;
      }
      if (lockResult.status === 'queued') {
        setDidQueuePlanning(true);
        await pendingTastingSessionWrites.refreshPendingWrites();
        return;
      }
      navigation.replace('TastingSessionPlanning', { sessionId: lockResult.result.id });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not lock group.');
    } finally {
      setIsLockingLobby(false);
    }
  };

  const handleReopenInviteWindow = async () => {
    try {
      setErrorMessage(null);
      setIsReopeningInviteWindow(true);
      const reopenResult = await tastingSessionWrites.reopenInviteWindow({
        joinDurationMinutes: reopenDuration,
        sessionId,
      });
      if (reopenResult.status === 'blocked') {
        setErrorMessage(reopenResult.message);
        return;
      }
      setIsReopenModalVisible(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not reopen invite window.');
    } finally {
      setIsReopeningInviteWindow(false);
    }
  };

  const handleConfirmKick = async () => {
    if (!pendingKick) {
      return;
    }
    try {
      const removeResult = await tastingSessionWrites.removeParticipant({
        participantId: pendingKick.id,
        sessionId,
      });
      if (removeResult.status === 'blocked') {
        setErrorMessage(removeResult.message);
        return;
      }
      setPendingKick(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not remove participant.');
    }
  };

  const handleConfirmDeleteSession = async () => {
    try {
      setErrorMessage(null);
      setIsDeletingSession(true);
      const deleteResult = await tastingSessionWrites.deleteSession({ sessionId });
      if (deleteResult.status === 'blocked') {
        setErrorMessage(deleteResult.message);
        return;
      }
      setIsDeleteSessionModalVisible(false);
      navigation.navigate('TastingSessions');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete tasting session.');
    } finally {
      setIsDeletingSession(false);
    }
  };

  const handleConfirmLeaveSession = async () => {
    try {
      setErrorMessage(null);
      setIsLeavingSession(true);
      const leaveResult = await tastingSessionWrites.leaveSession({ sessionId });
      if (leaveResult.status === 'blocked') {
        setErrorMessage(leaveResult.message);
        return;
      }
      setIsLeaveSessionModalVisible(false);
      navigation.navigate('TastingSessions');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not leave tasting session.');
    } finally {
      setIsLeavingSession(false);
    }
  };

  const handleResendInvite = async (invite: TastingInviteRecord) => {
    try {
      setErrorMessage(null);
      const resendResult = await tastingSessionWrites.resendInvite({
        inviteId: invite.id,
        sessionId,
      });
      if (resendResult.status === 'blocked') {
        setErrorMessage(resendResult.message);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not resend invite.');
    }
  };

  return (
    <TastingSessionLifecycleShell
      isError={sessionQuery.isError}
      loadingTitle="Loading lobby"
      onBackPress={() => navigation.navigate('TastingSessions')}
      session={session}
      title="Tasting Lobby"
    >
      {(availableSession) => (
        <FeatureDetailScreenScaffold
          headerBottomCompact
          headerBottomContent={
            <StepProgressBar
              compact
              currentStep={lifecycle.step.currentStep}
              steps={TASTING_SESSION_LIFECYCLE_STEPS}
            />
          }
          headerScrollMode="fixed"
          onBackPress={() => navigation.navigate('TastingSessions')}
          rightAccessory={
            isLeader ? (
              <Pressable
                accessibilityLabel="Delete tasting session"
                accessibilityRole="button"
                disabled={!isOnline || isDeletingSession}
                hitSlop={12}
                onPress={() => setIsDeleteSessionModalVisible(true)}
                style={({ pressed }) => [
                  styles.headerIconButton,
                  pressed ? styles.destructiveIconButtonPressed : null,
                  !isOnline || isDeletingSession ? styles.iconButtonDisabled : null,
                ]}
                testID="delete-tasting-session-header-button"
              >
                <Ionicons color={theme.colors.text.danger} name="trash-outline" size={16} />
              </Pressable>
            ) : undefined
          }
          subtitle={
            <View>
              <Text tone="muted">{formatCountdown(availableSession.joinExpiresAt)}</Text>
              <Text tone="muted">{lobbyInstruction}</Text>
            </View>
          }
          title={availableSession.name}
        >
          {isPlanningPending ? (
            <Text tone="success">Planning is queued and will start when you reconnect.</Text>
          ) : planningQueueState.status === 'failed' ? (
            <Text tone="danger">
              Queued planning failed to sync: {planningQueueState.message} Retry it from the sync banner.
            </Text>
          ) : !isOnline ? (
            <Text tone="warning">
              Invite and participant actions require a connection. Starting planning can be queued offline.
            </Text>
          ) : null}
          <PageErrorToast errorMessage={errorMessage} title="Lobby action failed" />
          <Card>
            <View style={styles.row}>
              <Text variant="label">Lobby</Text>
              <StatusPill label={`${availableSession.joinedCount}/${availableSession.maxParticipants} joined`} tone="info" />
            </View>
            {isLeader && availableSession.inviteCode && inviteWindowOpen ? <Text variant="titleMd">Code: {availableSession.inviteCode}</Text> : null}
            {isLeader && inviteWindowExpired ? <Text tone="secondary">Invite window closed.</Text> : null}
            {isLeader ? (
              inviteWindowExpired ? (
                <View style={styles.actionStack}>
                  <View style={styles.row}>
                    <Button
                      disabled
                      label="Share"
                      onPress={() => void handleShare()}
                      style={styles.action}
                      variant="secondary"
                    />
                    <Button
                      disabled={!isOnline}
                      label="Reopen Window"
                      onPress={() => {
                        setReopenDuration(60);
                        setIsReopenModalVisible(true);
                      }}
                      style={styles.action}
                      variant="secondary"
                    />
                  </View>
                  <Button
                    disabled={isPlanningPending || isLockingLobby}
                    label={isPlanningPending ? 'Planning Queued' : 'Start Planning'}
                    loading={isLockingLobby}
                    onPress={() => void handleLock()}
                  />
                </View>
              ) : (
                <View style={styles.actionStack}>
                  <View style={styles.row}>
                    <Button
                      disabled={!availableSession.inviteCode || !inviteWindowOpen}
                      label="Share"
                      onPress={() => void handleShare()}
                      style={styles.action}
                      variant="secondary"
                    />
                    <Button
                      disabled={isPlanningPending || isLockingLobby}
                      label={isPlanningPending ? 'Planning Queued' : 'Start Planning'}
                      loading={isLockingLobby}
                      onPress={() => void handleLock()}
                      style={styles.action}
                    />
                  </View>
                </View>
              )
            ) : isParticipant ? (
              <View style={styles.actionStack}>
                <Text tone="secondary">Waiting for the leader to lock the group.</Text>
                <Button
                  disabled={!isOnline || isLeavingSession}
                  label="Exit Session"
                  onPress={() => setIsLeaveSessionModalVisible(true)}
                  variant="secondary"
                />
              </View>
            ) : (
              <Text tone="secondary">Join this tasting session to wait in the lobby.</Text>
            )}
          </Card>

          <Card style={styles.sectionCard}>
            <Text variant="label">Participants</Text>
            <Input
              containerStyle={styles.lobbySearchInput}
              onChangeText={setParticipantSearchQuery}
              placeholder="Search participants"
              testID="tasting-lobby-participant-search-input"
              value={participantSearchQuery}
            />
            <View style={styles.lobbyList}>
              {filteredParticipants.length > 0 ? (
                filteredParticipants.map((participant, index) => {
                  const roleBadge = getParticipantRoleBadge(participant);

                  return (
                    <Fragment key={participant.id}>
                      <ListItem
                        style={styles.lobbyListItem}
                        title={participant.name}
                        titleAccessory={
                          <StatusPill label={roleBadge.label} style={styles.statusBadge} tone={roleBadge.tone} />
                        }
                        trailing={
                          isLeader && participant.role !== 'leader' ? (
                            <Pressable
                              accessibilityLabel={`Remove ${participant.name}`}
                              accessibilityRole="button"
                              disabled={!isOnline}
                              hitSlop={12}
                              onPress={() => setPendingKick(participant)}
                              style={({ pressed }) => [
                                styles.rowIconButton,
                                pressed ? styles.destructiveIconButtonPressed : null,
                                !isOnline ? styles.iconButtonDisabled : null,
                              ]}
                              testID={`remove-tasting-participant-${participant.id}`}
                            >
                              <Ionicons color={theme.colors.text.danger} name="trash-outline" size={18} />
                            </Pressable>
                          ) : null
                        }
                      />
                      {index < filteredParticipants.length - 1 ? <View style={styles.lobbyListSeparator} /> : null}
                    </Fragment>
                  );
                })
              ) : (
                <Text tone="secondary">No participants match your search.</Text>
              )}
            </View>
          </Card>

          {isLeader && availableSession.invites.length > 0 ? (
            <Card style={styles.sectionCard}>
              <Text variant="label">Invites</Text>
              <View style={styles.lobbyList}>
                {filteredInvites.length > 0 ? (
                  filteredInvites.map((invite, index) => {
                    const statusBadge = getInviteStatusBadge(getTastingInviteDisplayStatus(invite, availableSession));

                    return (
                      <Fragment key={invite.id}>
                        <ListItem
                          style={styles.lobbyListItem}
                          title={invite.invitedUserName}
                          titleAccessory={
                            <StatusPill label={statusBadge.label} style={styles.statusBadge} tone={statusBadge.tone} />
                          }
                          trailing={
                            isLeader &&
                            (invite.status === 'dismissed' || invite.status === 'revoked') &&
                            inviteWindowOpen ? (
                              <Button
                                disabled={!isOnline}
                                label="Resend"
                                onPress={() => void handleResendInvite(invite)}
                                variant="secondary"
                              />
                            ) : null
                          }
                        />
                        {index < filteredInvites.length - 1 ? <View style={styles.lobbyListSeparator} /> : null}
                      </Fragment>
                    );
                  })
                ) : (
                  <Text tone="secondary">No invites match your search.</Text>
                )}
              </View>
            </Card>
          ) : null}

          <ConfirmDestructiveModal
            cancelLabel="Keep"
            confirmLabel="Remove"
            description={
              pendingKick
                ? `Remove ${pendingKick.name} from this tasting session? They will not be able to rejoin with the current code.`
                : 'Remove this participant from the tasting session?'
            }
            onCancel={() => setPendingKick(null)}
            onConfirm={() => {
              void handleConfirmKick();
            }}
            title="Remove Participant?"
            visible={Boolean(pendingKick)}
          />
          <ConfirmDestructiveModal
            cancelLabel="Keep Session"
            confirmLabel="Delete Session"
            confirmLoadingLabel="Deleting..."
            description={`Delete "${availableSession.name}"? This removes the lobby, invites, participants, tasting plan, and ratings.`}
            disabled={isDeletingSession}
            loading={isDeletingSession}
            onCancel={() => {
              if (!isDeletingSession) {
                setIsDeleteSessionModalVisible(false);
              }
            }}
            onConfirm={() => {
              void handleConfirmDeleteSession();
            }}
            title="Delete Tasting Session?"
            visible={isDeleteSessionModalVisible}
          />
          <ConfirmDestructiveModal
            cancelLabel="Stay"
            confirmLabel="Exit Session"
            confirmLoadingLabel="Exiting..."
            description={`Exit "${availableSession.name}"? You will leave the lobby and return to group tastings.`}
            disabled={isLeavingSession}
            loading={isLeavingSession}
            onCancel={() => {
              if (!isLeavingSession) {
                setIsLeaveSessionModalVisible(false);
              }
            }}
            onConfirm={() => {
              void handleConfirmLeaveSession();
            }}
            title="Exit Tasting Session?"
            visible={isLeaveSessionModalVisible}
          />
          <Modal
            description="Choose how long people can join. A new invite code will be generated."
            onRequestClose={() => {
              if (!isReopeningInviteWindow) {
                setIsReopenModalVisible(false);
              }
            }}
            secondaryAction={{
              disabled: isReopeningInviteWindow,
              label: 'Cancel',
              onPress: () => setIsReopenModalVisible(false),
            }}
            primaryAction={{
              disabled: isReopeningInviteWindow || !isOnline,
              label: 'Reopen Window',
              loading: isReopeningInviteWindow,
              onPress: () => {
                void handleReopenInviteWindow();
              },
            }}
            title="Reopen Invite Window"
            visible={isReopenModalVisible}
          >
            <TastingJoinWindowDurationSelector
              disabled={isReopeningInviteWindow}
              onChange={setReopenDuration}
              value={reopenDuration}
            />
          </Modal>
        </FeatureDetailScreenScaffold>
      )}
    </TastingSessionLifecycleShell>
  );
}

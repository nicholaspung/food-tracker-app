import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { Ionicons } from '../ui/AppIcon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  ConfirmDestructiveModal,
  EmptyState,
  ErrorState,
  FeatureDetailScreenScaffold,
  PageErrorToast,
  StatusPill,
  StepProgressBar,
} from '../components/shared';
import {
  type TastingInviteRecord,
  type TastingParticipantRecord,
  useTastingSessionWrites,
} from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, ListItem, Modal, Text } from '../ui';
import {
  formatCountdown,
  getTastingInviteDisplayStatus,
  isTastingInviteWindowExpired,
  isTastingInviteWindowOpen,
  TASTING_SESSION_LIFECYCLE_STEPS,
} from './tastingSessions/shared';
import { TastingJoinWindowDurationSelector } from './tastingSessions/TastingJoinWindowDurationSelector';
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

export function TastingSessionLobbyScreen({ navigation, route }: TastingSessionLobbyScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { sessionId } = route.params;
  const { user } = useAuth();
  const tastingSessionWrites = useTastingSessionWrites();
  const lifecycle = useTastingSessionLifecycleReadState({
    currentUserId: user?.id,
    screen: 'lobby',
    sessionId,
  });
  const sessionQuery = lifecycle.query;
  const isOnline = lifecycle.onlineOnly.isOnline;
  const hasHandledRevokedAccessRef = useRef(false);
  const [pendingKick, setPendingKick] = useState<TastingParticipantRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReopenModalVisible, setIsReopenModalVisible] = useState(false);
  const [reopenDuration, setReopenDuration] = useState<number>(60);
  const [isReopeningInviteWindow, setIsReopeningInviteWindow] = useState(false);
  const [isDeleteSessionModalVisible, setIsDeleteSessionModalVisible] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [isLeaveSessionModalVisible, setIsLeaveSessionModalVisible] = useState(false);
  const [isLeavingSession, setIsLeavingSession] = useState(false);

  const session = sessionQuery.data;
  const isLeader = lifecycle.roles.isLeader;
  const isParticipant = lifecycle.roles.isParticipant;
  const inviteWindowOpen = session ? isTastingInviteWindowOpen(session.joinExpiresAt) : false;
  const inviteWindowExpired = session ? isTastingInviteWindowExpired(session.joinExpiresAt) : false;
  const lobbyInstruction = isLeader
    ? 'Invite people, share the code, and start planning when the group is ready.'
    : 'You are in the lobby. Wait for the leader to lock the group and start planning.';

  useEffect(() => {
    if (hasHandledRevokedAccessRef.current || !lifecycle.missingAccess.shouldHandle) {
      return;
    }
    hasHandledRevokedAccessRef.current = true;
    lifecycle.applyMissingAccessPolicy();

    navigation.navigate('TastingSessions', {
      errorMessage: lifecycle.missingAccess.message,
    });
  }, [lifecycle, navigation]);

  useEffect(() => {
    const destination = lifecycle.redirectDestination;
    if (!destination) {
      return;
    }

    if (destination.name === 'TastingSessions') {
      navigation.navigate(destination.name, destination.params);
    } else {
      navigation.replace(destination.name, destination.params);
    }
  }, [lifecycle.redirectDestination, navigation]);

  const handleShare = async () => {
    if (!session?.inviteCode || !inviteWindowOpen) {
      return;
    }
    await Share.share({ message: `Join my group tasting with code: ${session.inviteCode}` });
  };

  const handleLock = async () => {
    try {
      const lockResult = await tastingSessionWrites.lockLobby({ isOnline, sessionId });
      if (lockResult.status === 'blocked') {
        setErrorMessage(lockResult.message);
        return;
      }
      navigation.replace('TastingSessionPlanning', { sessionId: lockResult.result.id });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not lock group.');
    }
  };

  const handleReopenInviteWindow = async () => {
    try {
      setErrorMessage(null);
      setIsReopeningInviteWindow(true);
      const reopenResult = await tastingSessionWrites.reopenInviteWindow({
        isOnline,
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
        isOnline,
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
      const deleteResult = await tastingSessionWrites.deleteSession({ isOnline, sessionId });
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
      const leaveResult = await tastingSessionWrites.leaveSession({ isOnline, sessionId });
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
        isOnline,
        sessionId,
      });
      if (resendResult.status === 'blocked') {
        setErrorMessage(resendResult.message);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not resend invite.');
    }
  };

  if (sessionQuery.isError && !session) {
    return (
      <FeatureDetailScreenScaffold onBackPress={() => navigation.navigate('TastingSessions')} title="Tasting Lobby">
        <ErrorState description="Could not load this tasting session." title="Session unavailable" />
      </FeatureDetailScreenScaffold>
    );
  }

  if (!session) {
    return (
      <FeatureDetailScreenScaffold onBackPress={() => navigation.navigate('TastingSessions')} title="Tasting Lobby">
        <EmptyState title="Loading lobby" />
      </FeatureDetailScreenScaffold>
    );
  }

  return (
    <FeatureDetailScreenScaffold
      headerBottomCompact
      headerBottomContent={
        <StepProgressBar
          compact
          currentStep={lifecycle.step.currentStep}
          steps={TASTING_SESSION_LIFECYCLE_STEPS}
        />
      }
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
          <Text tone="muted">{formatCountdown(session.joinExpiresAt)}</Text>
          <Text tone="muted">{lobbyInstruction}</Text>
        </View>
      }
      title={session.name}
    >
      {lifecycle.onlineOnly.warningMessage ? (
        <Text tone="warning">{lifecycle.onlineOnly.warningMessage}</Text>
      ) : null}
      <PageErrorToast errorMessage={errorMessage} title="Lobby action failed" />
      <Card>
        <View style={styles.row}>
          <Text variant="label">Lobby</Text>
          <StatusPill label={`${session.joinedCount}/${session.maxParticipants} joined`} tone="info" />
        </View>
        {isLeader && session.inviteCode && inviteWindowOpen ? <Text variant="titleMd">Code: {session.inviteCode}</Text> : null}
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
              <Button disabled={!isOnline} label="Start Planning" onPress={() => void handleLock()} />
            </View>
          ) : (
            <View style={styles.actionStack}>
              <View style={styles.row}>
                <Button
                  disabled={!session.inviteCode || !inviteWindowOpen}
                  label="Share"
                  onPress={() => void handleShare()}
                  style={styles.action}
                  variant="secondary"
                />
                <Button
                  disabled={!isOnline}
                  label="Start Planning"
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

      <Card>
        <Text variant="label">Participants</Text>
        {session.participants.map((participant) => {
          const roleBadge = getParticipantRoleBadge(participant);

          return (
            <ListItem
              key={participant.id}
              title={participant.name}
              titleAccessory={<StatusPill label={roleBadge.label} style={styles.statusBadge} tone={roleBadge.tone} />}
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
          );
        })}
      </Card>

      {isLeader && session.invites.length > 0 ? (
        <Card>
          <Text variant="label">Invites</Text>
          {session.invites.map((invite) => {
            const statusBadge = getInviteStatusBadge(getTastingInviteDisplayStatus(invite, session));

            return (
              <ListItem
                key={invite.id}
                title={invite.invitedUserName}
                titleAccessory={<StatusPill label={statusBadge.label} style={styles.statusBadge} tone={statusBadge.tone} />}
                trailing={
                  isLeader && (invite.status === 'dismissed' || invite.status === 'revoked') && inviteWindowOpen ? (
                    <Button
                      disabled={!isOnline}
                      label="Resend"
                      onPress={() => void handleResendInvite(invite)}
                      variant="secondary"
                    />
                  ) : null
                }
              />
            );
          })}
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
        description={`Delete "${session.name}"? This removes the lobby, invites, participants, suggestions, and ratings.`}
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
        description={`Exit "${session.name}"? You will leave the lobby and return to group tastings.`}
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
  );
}

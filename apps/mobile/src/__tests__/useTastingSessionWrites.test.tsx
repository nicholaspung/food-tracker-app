import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import {
  acceptTastingInvite,
  createTastingSession,
  deleteTastingSession,
  dismissTastingInvite,
  joinTastingSession,
  kickTastingParticipant,
  lockTastingSessionMembership,
  reopenTastingInviteWindow,
  resendTastingInvite,
} from '../features/store/tastingSessionsApiStore';
import { tastingSessionsQueryKeys } from '../features/store/tastingSessionsQuery';
import { useTastingSessionWrites } from '../features/store/useTastingSessionWrites';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/tastingSessionsApiStore', () => ({
  acceptTastingInvite: jest.fn(),
  createTastingSession: jest.fn(),
  deleteTastingSession: jest.fn(),
  dismissTastingInvite: jest.fn(),
  joinTastingSession: jest.fn(),
  kickTastingParticipant: jest.fn(),
  lockTastingSessionMembership: jest.fn(),
  reopenTastingInviteWindow: jest.fn(),
  resendTastingInvite: jest.fn(),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedAcceptTastingInvite = acceptTastingInvite as jest.MockedFunction<typeof acceptTastingInvite>;
const mockedCreateTastingSession = createTastingSession as jest.MockedFunction<typeof createTastingSession>;
const mockedDeleteTastingSession = deleteTastingSession as jest.MockedFunction<typeof deleteTastingSession>;
const mockedDismissTastingInvite = dismissTastingInvite as jest.MockedFunction<typeof dismissTastingInvite>;
const mockedJoinTastingSession = joinTastingSession as jest.MockedFunction<typeof joinTastingSession>;
const mockedKickTastingParticipant = kickTastingParticipant as jest.MockedFunction<typeof kickTastingParticipant>;
const mockedLockTastingSessionMembership =
  lockTastingSessionMembership as jest.MockedFunction<typeof lockTastingSessionMembership>;
const mockedReopenTastingInviteWindow =
  reopenTastingInviteWindow as jest.MockedFunction<typeof reopenTastingInviteWindow>;
const mockedResendTastingInvite = resendTastingInvite as jest.MockedFunction<typeof resendTastingInvite>;

const tastingSession = {
  createdAt: '2026-05-20T00:00:00.000Z',
  createdByUserId: 'user_1',
  id: 'session_1',
  inviteCode: 'ABC123',
  invites: [],
  joinExpiresAt: '2026-05-20T01:00:00.000Z',
  joinedCount: 1,
  leaderUserId: 'user_1',
  maxApprovedItems: 8,
  maxParticipants: 8,
  maxRestaurants: 3,
  name: 'Ramen night',
  participants: [],
  restaurants: [],
  status: 'lobby',
  updatedAt: '2026-05-20T00:00:00.000Z',
} as const;

describe('useTastingSessionWrites', () => {
  const queryClient = {
    cancelQueries: jest.fn(),
    invalidateQueries: jest.fn(),
    setQueryData: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.cancelQueries.mockResolvedValue(undefined);
    queryClient.invalidateQueries.mockResolvedValue(undefined);
    mockedUseQueryClient.mockReturnValue(queryClient as never);
    mockedAcceptTastingInvite.mockResolvedValue(tastingSession as never);
    mockedCreateTastingSession.mockResolvedValue(tastingSession as never);
    mockedDeleteTastingSession.mockResolvedValue({ success: true });
    mockedDismissTastingInvite.mockResolvedValue({ success: true });
    mockedJoinTastingSession.mockResolvedValue(tastingSession as never);
    mockedKickTastingParticipant.mockResolvedValue(tastingSession as never);
    mockedLockTastingSessionMembership.mockResolvedValue({
      ...tastingSession,
      status: 'planning',
    } as never);
    mockedReopenTastingInviteWindow.mockResolvedValue({
      ...tastingSession,
      inviteCode: 'NEWA12',
      joinExpiresAt: '2026-05-20T02:00:00.000Z',
    } as never);
    mockedResendTastingInvite.mockResolvedValue(tastingSession as never);
  });

  async function renderHook(): Promise<{
    hook: ReturnType<typeof useTastingSessionWrites>;
    renderer: ReactTestRenderer;
  }> {
    let hook: ReturnType<typeof useTastingSessionWrites> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useTastingSessionWrites();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    if (!hook || !renderer) {
      throw new Error('Expected hook to render.');
    }

    return { hook, renderer };
  }

  it('creates and joins tasting sessions while refreshing the session list', async () => {
    const { hook, renderer } = await renderHook();

    await hook.createSession({
      invitedUserIds: ['friend_user_1'],
      isOnline: true,
      joinDurationMinutes: 60,
      name: 'Ramen night',
    });
    await hook.joinSession({
      inviteCode: 'abc123',
      isOnline: true,
    });

    expect(mockedCreateTastingSession).toHaveBeenCalledWith({
      invitedUserIds: ['friend_user_1'],
      joinDurationMinutes: 60,
      name: 'Ramen night',
    });
    expect(mockedJoinTastingSession).toHaveBeenCalledWith({ inviteCode: 'abc123' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: tastingSessionsQueryKeys.root,
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('handles invite actions through tasting session list refreshes', async () => {
    const { hook, renderer } = await renderHook();

    await hook.acceptInvite({ isOnline: true, sessionId: 'session_1' });
    await hook.dismissInvite({ isOnline: true, sessionId: 'session_1' });

    expect(mockedAcceptTastingInvite).toHaveBeenCalledWith('session_1');
    expect(mockedDismissTastingInvite).toHaveBeenCalledWith('session_1');
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: tastingSessionsQueryKeys.root,
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('handles lobby actions through list and detail refreshes', async () => {
    const { hook, renderer } = await renderHook();

    await hook.lockLobby({ isOnline: true, sessionId: 'session_1' });
    await hook.removeParticipant({
      isOnline: true,
      participantId: 'participant_1',
      sessionId: 'session_1',
    });
    await hook.reopenInviteWindow({
      isOnline: true,
      joinDurationMinutes: 60,
      sessionId: 'session_1',
    });
    await hook.resendInvite({
      inviteId: 'invite_1',
      isOnline: true,
      sessionId: 'session_1',
    });

    expect(mockedLockTastingSessionMembership).toHaveBeenCalledWith('session_1');
    expect(mockedKickTastingParticipant).toHaveBeenCalledWith('session_1', 'participant_1');
    expect(mockedReopenTastingInviteWindow).toHaveBeenCalledWith('session_1', {
      joinDurationMinutes: 60,
    });
    expect(mockedResendTastingInvite).toHaveBeenCalledWith('session_1', 'invite_1');
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: tastingSessionsQueryKeys.root,
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: tastingSessionsQueryKeys.detail('session_1'),
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('deletes a tasting session without refetching the deleted detail query', async () => {
    const { hook, renderer } = await renderHook();

    await hook.deleteSession({
      isOnline: true,
      sessionId: 'session_1',
    });

    expect(mockedDeleteTastingSession).toHaveBeenCalledWith('session_1');
    expect(queryClient.cancelQueries).toHaveBeenCalledWith({
      queryKey: tastingSessionsQueryKeys.detail('session_1'),
    });
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      tastingSessionsQueryKeys.root,
      expect.any(Function),
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      tastingSessionsQueryKeys.detail('session_1'),
      null,
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: tastingSessionsQueryKeys.root,
    });
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: tastingSessionsQueryKeys.detail('session_1'),
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('blocks offline lifecycle actions without calling write functions', async () => {
    const { hook, renderer } = await renderHook();

    const createResult = await hook.createSession({
      invitedUserIds: [],
      isOnline: false,
      joinDurationMinutes: 60,
      name: 'Ramen night',
    });
    const lockResult = await hook.lockLobby({ isOnline: false, sessionId: 'session_1' });
    const reopenResult = await hook.reopenInviteWindow({
      isOnline: false,
      joinDurationMinutes: 60,
      sessionId: 'session_1',
    });
    const deleteResult = await hook.deleteSession({
      isOnline: false,
      sessionId: 'session_1',
    });
    const resendResult = await hook.resendInvite({
      inviteId: 'invite_1',
      isOnline: false,
      sessionId: 'session_1',
    });

    expect(createResult).toEqual({
      message: 'Connect to the internet to create a group tasting.',
      status: 'blocked',
    });
    expect(lockResult).toEqual({
      message: 'Connect to the internet to lock the group.',
      status: 'blocked',
    });
    expect(reopenResult).toEqual({
      message: 'Connect to the internet to reopen the invite window.',
      status: 'blocked',
    });
    expect(deleteResult).toEqual({
      message: 'Connect to the internet to delete this tasting session.',
      status: 'blocked',
    });
    expect(resendResult).toEqual({
      message: 'Connect to the internet to resend this invite.',
      status: 'blocked',
    });
    expect(mockedCreateTastingSession).not.toHaveBeenCalled();
    expect(mockedDeleteTastingSession).not.toHaveBeenCalled();
    expect(mockedLockTastingSessionMembership).not.toHaveBeenCalled();
    expect(mockedReopenTastingInviteWindow).not.toHaveBeenCalled();
    expect(mockedResendTastingInvite).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });
});

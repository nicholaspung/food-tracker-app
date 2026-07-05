import React from 'react';
import { act, create } from 'react-test-renderer';

import { useTastingRatingSubmissionWrites } from '../features';
import type { TastingSessionRecord } from '../features';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { TastingSessionTastingScreen } from '../screens/TastingSessionTastingScreen';
import { useTastingSessionLifecycleReadState } from '../screens/tastingSessions/useTastingSessionLifecycleReadState';

const mockReact = React;
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockSubmitRatingDraft = jest.fn();
const mockCompleteTasting = jest.fn();

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Linking: {
    openSettings: jest.fn(),
  },
  Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, children),
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../components/shared', () => ({
  ConfirmDestructiveModal: (props: Record<string, unknown>) =>
    mockReact.createElement('ConfirmDestructiveModal', props),
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  FeatureFormScreenScaffold: ({
    children,
    primaryAction,
    secondaryAction,
    ...props
  }: Record<string, unknown> & {
    children?: React.ReactNode;
    primaryAction: Record<string, unknown>;
    secondaryAction?: Record<string, unknown>;
  }) =>
    mockReact.createElement(
      'FeatureFormScreenScaffold',
      props,
      secondaryAction ? mockReact.createElement('Button', secondaryAction) : null,
      mockReact.createElement('Button', primaryAction),
      children,
    ),
  HomeFeedVisitEntryCard: (props: Record<string, unknown>) =>
    mockReact.createElement('HomeFeedVisitEntryCard', props),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  PhotoInputField: (props: Record<string, unknown>) => mockReact.createElement('PhotoInputField', props),
  PhotoViewerModal: (props: Record<string, unknown>) => mockReact.createElement('PhotoViewerModal', props),
  RatingLegend: (props: Record<string, unknown>) => mockReact.createElement('RatingLegend', props),
  VisitItemRatingCard: (props: Record<string, unknown>) => mockReact.createElement('VisitItemRatingCard', props),
}));

jest.mock('../features', () => ({
  FREE_MONTHLY_PHOTO_UPLOAD_LIMIT: 100,
  formatFreeMonthlyPhotoLimitStatus: jest.fn(
    (remaining: number) =>
      `Free users can upload up to 100 photos per month. Remaining estimate: ${remaining}.`,
  ),
  useTastingRatingSubmissionWrites: jest.fn(),
  useMonthlyUsage: jest.fn(() => ({
    snapshot: {
      limits: {
        photoUploadsPerRecord: 1,
      },
      remaining: {
        photoUploadsMonthly: 99,
      },
      usage: {
        photoUploads: 0,
      },
    },
  })),
}));

jest.mock('../hooks/usePhotoPickerPermissions', () => ({
  usePhotoPickerPermissions: jest.fn(() => ({
    permissionNeedsSettings: false,
    requestPermission: jest.fn(),
    resetPermissionNeedsSettings: jest.fn(),
  })),
}));

jest.mock('../lib/dateFormatting', () => ({
  formatDateToLocalDateString: jest.fn(() => '2026-05-19'),
  formatPhotoAttachmentDateLabel: jest.fn(() => 'Today'),
}));

jest.mock('../lib/photoMetadata', () => ({
  resolvePhotoCaptureDate: jest.fn(),
}));

jest.mock('../lib/photoStaging', () => ({
  stageLocalPhotoFile: jest.fn(),
}));

jest.mock('../lib/usageUiRules', () => ({
  resolveDisplayPhotoUploadsPerRecordLimit: jest.fn(() => 1),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(
        {
          colors: {
            background: {
              muted: '#muted',
            },
            text: {
              primary: '#primary',
            },
          },
          radii: {
            pill: 999,
          },
          spacing: {
            md: 16,
            sm: 8,
            xs: 4,
            xxs: 2,
          },
        },
        ...args,
      ),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Modal: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Modal', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../screens/tastingSessions/useTastingSessionLifecycleReadState', () => ({
  useTastingSessionLifecycleReadState: jest.fn(),
}));

const mockedUseTastingRatingSubmissionWrites =
  useTastingRatingSubmissionWrites as jest.MockedFunction<typeof useTastingRatingSubmissionWrites>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
const mockedUseTastingSessionLifecycleReadState = useTastingSessionLifecycleReadState as jest.MockedFunction<
  typeof useTastingSessionLifecycleReadState
>;

interface TestRendererHandle {
  root: {
    findByProps: (props: Record<string, unknown>) => { props: Record<string, () => void> };
    findAllByProps: (props: Record<string, unknown>) => unknown[];
  };
}

const tastingSession: TastingSessionRecord = {
  id: 'session-1',
  createdAt: '2026-05-19T10:00:00.000Z',
  invites: [],
  joinExpiresAt: '2026-05-19T11:00:00.000Z',
  joinedCount: 1,
  leaderUserId: 'user-1',
  maxApprovedItems: 6,
  maxParticipants: 4,
  maxRestaurants: 3,
  name: 'Test',
  participants: [
    {
      id: 'participant-1',
      joinedAt: '2026-05-19T10:01:00.000Z',
      name: 'Leader',
      role: 'leader',
      userId: 'user-1',
    },
    {
      id: 'participant-2',
      joinedAt: '2026-05-19T10:02:00.000Z',
      name: 'Mina',
      role: 'participant',
      userId: 'user-2',
    },
  ],
  restaurants: [
    {
      createdAt: '2026-05-19T10:05:00.000Z',
      id: 'restaurant-suggestion-1',
      items: [
        {
          createdAt: '2026-05-19T10:06:00.000Z',
          id: 'tasting-item-1',
          menuItemId: 'menu-item-1',
          name: 'Sample',
          ratings: [],
          restaurantSuggestionId: 'restaurant-suggestion-1',
          status: 'approved',
          suggestedByParticipantId: 'participant-1',
        },
      ],
      restaurantId: 'restaurant-1',
      restaurantName: 'Corner Ramen',
      status: 'approved',
      suggestedByParticipantId: 'participant-1',
    },
  ],
  status: 'tasting',
  updatedAt: '2026-05-19T10:10:00.000Z',
};

describe('TastingSessionTastingScreen', () => {
  function mockLifecycleSession(session: TastingSessionRecord | null) {
    mockedUseTastingSessionLifecycleReadState.mockReturnValue({
      applyMissingAccessPolicy: jest.fn(),
      missingAccess: {
        message: 'Your invite was revoked.',
        redirectDestination: { name: 'TastingSessions', params: { errorMessage: 'Your invite was revoked.' } },
        shouldHandle: false,
      },
      onlineOnly: {
        actionsDisabled: !mockedUseConnectivity().isOnline,
        isOnline: mockedUseConnectivity().isOnline,
        warningMessage: mockedUseConnectivity().isOnline ? null : 'Rating actions require a connection.',
      },
      query: {
        data: session,
        isError: false,
        isLoading: false,
      },
      redirectDestination: session?.status === 'completed'
        ? { name: 'TastingSessionResults', params: { sessionId: session.id } }
        : null,
      roles: {
        currentParticipant: session?.participants.find((participant) => participant.userId === mockedUseAuth().user?.id) ?? null,
        isInvitee: false,
        isLeader: Boolean(session && mockedUseAuth().user?.id === session.leaderUserId),
        isParticipant: Boolean(session?.participants.some((participant) => participant.userId === mockedUseAuth().user?.id)),
      },
      shouldPoll: true,
      step: {
        currentStep: session?.status === 'completed' ? 3 : 2,
        label: session?.status === 'completed' ? 'Review' : 'Rate',
        stage: session?.status === 'completed' ? 'review' : 'rate',
      },
    } as unknown as ReturnType<typeof useTastingSessionLifecycleReadState>);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({
      actualUser: { id: 'user-1', isAdmin: true },
      user: {
        id: 'user-1',
        isAdmin: true,
        isSubscriber: false,
      },
    } as ReturnType<typeof useAuth>);
    mockedUseConnectivity.mockReturnValue({ isOnline: true } as ReturnType<typeof useConnectivity>);
    mockLifecycleSession(tastingSession);
    mockSubmitRatingDraft.mockResolvedValue({
      result: tastingSession,
      status: 'completed',
    });
    mockCompleteTasting.mockResolvedValue({
      result: tastingSession,
      status: 'completed',
    });
    mockedUseTastingRatingSubmissionWrites.mockReturnValue({
      completeTasting: mockCompleteTasting,
      submitRatingDraft: mockSubmitRatingDraft,
    } as unknown as ReturnType<typeof useTastingRatingSubmissionWrites>);
  });

  it('submits the visible approved tasting items and advances to review', async () => {
    let renderer: TestRendererHandle;
    await act(async () => {
      renderer = create(
        <TastingSessionTastingScreen
          navigation={{ navigate: mockNavigate, replace: mockReplace } as never}
          route={{ params: { sessionId: 'session-1' } } as never}
        />,
      ) as unknown as TestRendererHandle;
    });

    const submitButton = renderer!.root.findByProps({ testID: 'tasting-submit-ratings-button' });

    await act(async () => {
      submitButton.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSubmitRatingDraft).toHaveBeenCalledWith({
      approvedRestaurants: tastingSession.restaurants,
      currentUserId: 'user-1',
      draftByItemId: {
        'tasting-item-1': {
          included: true,
          note: '',
          photos: [],
          rating: 3,
        },
      },
      isOnline: true,
      sessionId: 'session-1',
    });
    expect(renderer!.root.findAllByProps({ title: 'Review Your Ratings' }).length).toBeGreaterThan(0);
    expect(renderer!.root.findAllByProps({ label: 'Update Ratings' })).toHaveLength(1);
    expect(renderer!.root.findAllByProps({ label: 'Complete' })).toHaveLength(1);
    expect(
      renderer!.root.findAllByProps({ testID: 'tasting-completion-summary-card' }).length,
    ).toBeGreaterThan(0);
    expect(renderer!.root.findAllByProps({ children: 'Still rating' }).length).toBeGreaterThan(0);
    expect(
      renderer!.root.findAllByProps({
        children: 'Ratings saved. You can edit and submit again until the tasting is completed.',
      }),
    ).toHaveLength(0);
  });

  it('sends participants to results when the tasting is completed', async () => {
    mockedUseAuth.mockReturnValue({
      actualUser: { id: 'user-2', isAdmin: false },
      user: {
        id: 'user-2',
        isAdmin: false,
        isSubscriber: false,
      },
    } as ReturnType<typeof useAuth>);
    mockLifecycleSession({
        ...tastingSession,
        status: 'completed',
      });

    await act(async () => {
      create(
        <TastingSessionTastingScreen
          navigation={{ navigate: mockNavigate, replace: mockReplace } as never}
          route={{ params: { sessionId: 'session-1' } } as never}
        />,
      );
    });

    expect(mockReplace).toHaveBeenCalledWith('TastingSessionResults', {
      sessionId: 'session-1',
    });
  });
});

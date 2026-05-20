import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { FeedbackMessageRecord, FeedbackRecord } from '../features/models';
import { createFeedback, sendFeedbackMessage } from '../features/store/feedbackStore';
import { feedbackQueryKeys } from '../features/store/feedbackQuery';
import { useFeedbackWrites } from '../features/store/useFeedbackWrites';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/feedbackStore', () => ({
  createFeedback: jest.fn(),
  sendFeedbackMessage: jest.fn(),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedCreateFeedback = createFeedback as jest.MockedFunction<typeof createFeedback>;
const mockedSendFeedbackMessage = sendFeedbackMessage as jest.MockedFunction<typeof sendFeedbackMessage>;
const mockedUseOfflineAwareFeatureWrite =
  useOfflineAwareFeatureWrite as jest.MockedFunction<typeof useOfflineAwareFeatureWrite>;
const mockedShowQueuedOfflineAlert = showQueuedOfflineAlert as jest.MockedFunction<
  typeof showQueuedOfflineAlert
>;

describe('useFeedbackWrites', () => {
  const queryClient = {
    invalidateQueries: jest.fn(),
    setQueryData: jest.fn(),
  };
  const feedback: FeedbackRecord = {
    adminUnreadCount: 1,
    createdAt: '2026-05-20T00:00:00.000Z',
    description: 'Something happened',
    id: 'feedback_1',
    status: 'open',
    title: 'Bug report',
    updatedAt: '2026-05-20T00:00:00.000Z',
    userId: 'user_1',
    userUnreadCount: 0,
  };
  const message: FeedbackMessageRecord = {
    createdAt: '2026-05-20T00:01:00.000Z',
    feedbackId: 'feedback_1',
    id: 'message_1',
    isAdminMessage: false,
    message: 'More detail',
    userId: 'user_1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQueryClient.mockReturnValue(queryClient as never);
    mockedCreateFeedback.mockResolvedValue(feedback as never);
    mockedSendFeedbackMessage.mockResolvedValue({ feedback, message } as never);
    queryClient.invalidateQueries.mockResolvedValue(undefined);
  });

  async function renderHook(): Promise<{
    hook: ReturnType<typeof useFeedbackWrites>;
    renderer: ReactTestRenderer;
  }> {
    let hook: ReturnType<typeof useFeedbackWrites> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useFeedbackWrites();
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

  it('creates feedback through the outbox payload and patches completed caches', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.createFeedback({
      description: 'Something happened',
      title: 'Bug report',
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'feedback.create',
        offline: {
          strategy: 'outbox',
          payload: {
            description: 'Something happened',
            title: 'Bug report',
          },
        },
      }),
    );
    expect(mockedCreateFeedback).toHaveBeenCalledWith({
      description: 'Something happened',
      title: 'Bug report',
    });
    expect(queryClient.setQueryData).toHaveBeenCalledWith(feedbackQueryKeys.list, expect.any(Function));
    expect(queryClient.setQueryData).toHaveBeenCalledWith(feedbackQueryKeys.detail('feedback_1'), feedback);
    expect(queryClient.setQueryData).toHaveBeenCalledWith(feedbackQueryKeys.summary, expect.any(Function));

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues feedback creation and invalidates feedback queries', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.createFeedback({
      description: 'Queued detail',
      queuedAlert: {
        analyticsSource: 'CreateFeedbackScreen',
        subject: 'Feedback',
      },
      title: 'Queued feedback',
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'feedback.create',
        offline: {
          strategy: 'outbox',
          payload: {
            description: 'Queued detail',
            title: 'Queued feedback',
          },
        },
      }),
    );
    expect(mockedCreateFeedback).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: feedbackQueryKeys.root });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith({
      analyticsSource: 'CreateFeedbackScreen',
      subject: 'Feedback',
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('sends feedback messages through the outbox payload and patches thread caches', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.sendFeedbackMessage({
      feedbackId: 'feedback_1',
      message: 'More detail',
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'feedback.message.send',
        offline: {
          strategy: 'outbox',
          payload: {
            feedbackId: 'feedback_1',
            message: 'More detail',
          },
        },
      }),
    );
    expect(mockedSendFeedbackMessage).toHaveBeenCalledWith({
      feedbackId: 'feedback_1',
      message: 'More detail',
    });
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      feedbackQueryKeys.thread('feedback_1'),
      expect.any(Function),
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(feedbackQueryKeys.list, expect.any(Function));
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      feedbackQueryKeys.messages('feedback_1'),
      expect.any(Function),
    );

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues feedback messages and invalidates message queries', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.sendFeedbackMessage({
      feedbackId: 'feedback_1',
      message: 'Queued detail',
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'feedback.message.send',
        offline: {
          strategy: 'outbox',
          payload: {
            feedbackId: 'feedback_1',
            message: 'Queued detail',
          },
        },
      }),
    );
    expect(mockedSendFeedbackMessage).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: feedbackQueryKeys.messages('feedback_1'),
    });

    await act(async () => {
      renderer.unmount();
    });
  });
});

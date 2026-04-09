import type { FeedbackMessageRecord, FeedbackRecord } from '../features/models';
import {
  feedbackQueryKeys,
  prependFeedbackListItem,
  prependFeedbackMessageListItem,
  upsertFeedbackListItem,
} from '../features/store/feedbackQuery';

function buildFeedbackRecord(id: string): FeedbackRecord {
  return {
    id,
    userId: 'user_1',
    title: `Feedback ${id}`,
    description: `Description ${id}`,
    status: 'open',
    adminUnreadCount: 0,
    userUnreadCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildFeedbackMessageRecord(id: string): FeedbackMessageRecord {
  return {
    id,
    feedbackId: 'feedback_1',
    userId: 'user_1',
    message: `Message ${id}`,
    isAdminMessage: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('feedbackQuery', () => {
  it('uses the canonical paginated feedback list key', () => {
    expect(feedbackQueryKeys.list).toEqual(['feature', 'feedback', 'all', 'paginated']);
  });

  it('uses the canonical feedback messages key', () => {
    expect(feedbackQueryKeys.messages('feedback_1')).toEqual(['feature', 'feedback-messages', 'feedback_1']);
  });

  it('prepends new feedback into the loaded first page without duplicating entries', () => {
    const currentData = {
      pages: [
        {
          items: [buildFeedbackRecord('feedback_2'), buildFeedbackRecord('feedback_1')],
          page: 1,
          pageSize: 20,
          totalItems: 2,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    };

    const nextData = prependFeedbackListItem(currentData, buildFeedbackRecord('feedback_3'));

    expect(nextData.pages[0]?.items.map((item) => item.id)).toEqual(['feedback_3', 'feedback_2', 'feedback_1']);
    expect(nextData.pages[0]?.totalItems).toBe(3);
  });

  it('creates an overflow page when all loaded feedback pages were already full', () => {
    const currentData = {
      pages: [
        {
          items: [buildFeedbackRecord('feedback_2'), buildFeedbackRecord('feedback_1')],
          page: 1,
          pageSize: 2,
          totalItems: 2,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    };

    const nextData = prependFeedbackListItem(currentData, buildFeedbackRecord('feedback_3'));

    expect(nextData.pages).toHaveLength(2);
    expect(nextData.pages[0]?.items.map((item) => item.id)).toEqual(['feedback_3', 'feedback_2']);
    expect(nextData.pages[1]).toMatchObject({
      items: [expect.objectContaining({ id: 'feedback_1' })],
      page: 2,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
      hasNextPage: false,
    });
    expect(nextData.pageParams).toEqual([1, 2]);
  });

  it('updates an existing feedback thread in place when reordering is not needed', () => {
    const currentData = {
      pages: [
        {
          items: [buildFeedbackRecord('feedback_2'), buildFeedbackRecord('feedback_1')],
          page: 1,
          pageSize: 20,
          totalItems: 2,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    };

    const nextData = upsertFeedbackListItem(currentData, {
      ...buildFeedbackRecord('feedback_1'),
      userUnreadCount: 0,
      status: 'resolved',
    });

    expect(nextData?.pages[0]?.items.map((item) => item.id)).toEqual(['feedback_2', 'feedback_1']);
    expect(nextData?.pages[0]?.items[1]).toMatchObject({
      id: 'feedback_1',
      status: 'resolved',
      userUnreadCount: 0,
    });
  });

  it('moves an updated feedback thread to the front when requested', () => {
    const currentData = {
      pages: [
        {
          items: [buildFeedbackRecord('feedback_2'), buildFeedbackRecord('feedback_1')],
          page: 1,
          pageSize: 20,
          totalItems: 2,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    };

    const nextData = upsertFeedbackListItem(
      currentData,
      {
        ...buildFeedbackRecord('feedback_1'),
        lastMessageAt: '2026-01-02T00:00:00.000Z',
      },
      {
        moveToFront: true,
      },
    );

    expect(nextData?.pages[0]?.items.map((item) => item.id)).toEqual(['feedback_1', 'feedback_2']);
    expect(nextData?.pages[0]?.items[0]).toMatchObject({
      id: 'feedback_1',
      lastMessageAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('prepends a sent message into the first loaded messages page', () => {
    const currentData = {
      pages: [
        {
          items: [buildFeedbackMessageRecord('message_2'), buildFeedbackMessageRecord('message_1')],
          page: 1,
          pageSize: 2,
          totalItems: 2,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    };

    const nextData = prependFeedbackMessageListItem(currentData, buildFeedbackMessageRecord('message_3'));

    expect(nextData.pages).toHaveLength(2);
    expect(nextData.pages[0]?.items.map((item) => item.id)).toEqual(['message_3', 'message_2']);
    expect(nextData.pages[1]).toMatchObject({
      items: [expect.objectContaining({ id: 'message_1' })],
      page: 2,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
      hasNextPage: false,
    });
  });
});

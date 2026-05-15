import {
  getQueuedMutationOperationName,
  parseQueuedFeatureWrite,
  parseQueuedFeatureWrites,
  parseQueuedMutationBody,
} from '../features/store/queuedFeatureWrites';
import type { QueuedMutation } from '../offline/types';

function createQueuedMutation(overrides: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    id: 'mut_1',
    method: 'POST',
    url: 'local://feature/tasting-session.create',
    body: JSON.stringify({
      name: 'Friday noodles',
      joinDurationMinutes: 60,
      invitedUserIds: ['user_2'],
    }),
    headers: {
      'X-Mobile-Write-Operation': 'tasting-session.create',
    },
    status: 'pending',
    idempotencyKey: 'idem_1',
    attemptCount: 0,
    maxAttempts: 5,
    nextRetryAt: 0,
    lastError: null,
    createdAt: 1000,
    updatedAt: 1000,
    lastAttemptAt: null,
    ...overrides,
  };
}

describe('queuedFeatureWrites', () => {
  it('parses queued feature writes with typed operation metadata', () => {
    const parsed = parseQueuedFeatureWrite(createQueuedMutation());

    expect(parsed).toEqual({
      id: 'mut_1',
      operationName: 'tasting-session.create',
      payload: {
        name: 'Friday noodles',
        joinDurationMinutes: 60,
        invitedUserIds: ['user_2'],
      },
      status: 'pending',
      createdAt: 1000,
      idempotencyKey: 'idem_1',
      lastError: null,
    });
  });

  it('falls back to the local feature URL when the operation header is missing', () => {
    expect(
      getQueuedMutationOperationName(
        createQueuedMutation({
          headers: {},
          url: 'local://feature/tasting-session.join',
        }),
      ),
    ).toBe('tasting-session.join');
  });

  it('excludes unknown and malformed queue rows from feature UI parsing', () => {
    const parsed = parseQueuedFeatureWrites([
      createQueuedMutation(),
      createQueuedMutation({
        id: 'mut_unknown',
        headers: {
          'X-Mobile-Write-Operation': 'unknown.operation',
        },
        url: 'local://feature/unknown.operation',
      }),
      createQueuedMutation({
        id: 'mut_bad_json',
        body: '{bad-json',
      }),
    ]);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('mut_1');
  });

  it('returns null for malformed JSON bodies', () => {
    expect(parseQueuedMutationBody(createQueuedMutation({ body: '{bad-json' }))).toBeNull();
  });
});

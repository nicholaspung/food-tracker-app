import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useFeatureWriteSubmit } from '../features/store/useFeatureWriteSubmit';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

const mockedUseOfflineAwareFeatureWrite = useOfflineAwareFeatureWrite as jest.MockedFunction<
  typeof useOfflineAwareFeatureWrite
>;
const mockedShowQueuedOfflineAlert = showQueuedOfflineAlert as jest.MockedFunction<
  typeof showQueuedOfflineAlert
>;

describe('useFeatureWriteSubmit', () => {
  beforeEach(() => {
    mockedUseOfflineAwareFeatureWrite.mockReset();
    mockedShowQueuedOfflineAlert.mockReset();
  });

  it('runs success and settled callbacks after a completed write', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'completed', result: 'saved' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>);
    const onSuccess = jest.fn();
    const onSettledInvalidate = jest.fn();
    let hook: ReturnType<typeof useFeatureWriteSubmit> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useFeatureWriteSubmit();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    await act(async () => {
      await hook?.submitFeatureWrite({
        operationName: 'note.delete',
        offline: {
          strategy: 'outbox',
          payload: { noteId: 'note_1' },
        },
        execute: jest.fn(),
        fallbackErrorMessage: 'Could not delete note.',
        onSuccess,
        onSettledInvalidate,
      });
    });

    expect(onSuccess).toHaveBeenCalledWith('saved');
    expect(onSettledInvalidate).toHaveBeenCalledTimes(1);
    expect(mockedShowQueuedOfflineAlert).not.toHaveBeenCalled();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it('runs queued callbacks and queued toast after a queued write', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>);
    const onQueued = jest.fn();
    const onSettledInvalidate = jest.fn();
    let hook: ReturnType<typeof useFeatureWriteSubmit> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useFeatureWriteSubmit();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    await act(async () => {
      await hook?.submitFeatureWrite({
        operationName: 'bill.delete',
        offline: {
          strategy: 'api',
          input: {
            method: 'DELETE',
            url: 'https://example.test/api/bills/bill_1',
          },
        },
        execute: jest.fn(),
        fallbackErrorMessage: 'Could not delete bill.',
        onQueued,
        onSettledInvalidate,
        queuedToast: 'Bill delete',
      });
    });

    expect(onQueued).toHaveBeenCalledTimes(1);
    expect(onSettledInvalidate).toHaveBeenCalledTimes(1);
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith('Bill delete');

    await act(async () => {
      renderer?.unmount();
    });
  });
});


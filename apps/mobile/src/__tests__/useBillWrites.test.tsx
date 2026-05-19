import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { createBill, deleteBill } from '../features/store/billsStore';
import { billsQueryKeys } from '../features/store/billsQuery';
import {
  createBillApiMutationInput,
  deleteBillApiMutationInput,
} from '../features/store/featureOutboxOperations';
import { useBillWrites } from '../features/store/useBillWrites';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/billsStore', () => ({
  createBill: jest.fn(),
  deleteBill: jest.fn(),
  markBillParticipantPaid: jest.fn(),
  updateBill: jest.fn(),
}));

jest.mock('../features/store/featureOutboxOperations', () => ({
  createBillApiMutationInput: jest.fn((payload: unknown) => ({
    body: payload,
    method: 'POST',
    url: 'https://example.test/api/bills',
  })),
  deleteBillApiMutationInput: jest.fn((billId: string) => ({
    method: 'DELETE',
    url: `https://example.test/api/bills/${billId}`,
  })),
  updateBillApiMutationInput: jest.fn((billId: string, updates: unknown) => ({
    body: updates,
    method: 'PUT',
    url: `https://example.test/api/bills/${billId}`,
  })),
  updateBillParticipantPaidStatusApiMutationInput: jest.fn(
    (billId: string, participantId: string, paidStatus: string) => ({
      body: { paidStatus },
      method: 'PATCH',
      url: `https://example.test/api/bills/${billId}/participants/${participantId}/paid-status`,
    }),
  ),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedCreateBill = createBill as jest.MockedFunction<typeof createBill>;
const mockedDeleteBill = deleteBill as jest.MockedFunction<typeof deleteBill>;
const mockedCreateBillApiMutationInput =
  createBillApiMutationInput as jest.MockedFunction<typeof createBillApiMutationInput>;
const mockedDeleteBillApiMutationInput =
  deleteBillApiMutationInput as jest.MockedFunction<typeof deleteBillApiMutationInput>;
const mockedUseOfflineAwareFeatureWrite =
  useOfflineAwareFeatureWrite as jest.MockedFunction<typeof useOfflineAwareFeatureWrite>;
const mockedShowQueuedOfflineAlert = showQueuedOfflineAlert as jest.MockedFunction<
  typeof showQueuedOfflineAlert
>;

describe('useBillWrites', () => {
  const queryClient = {
    invalidateQueries: jest.fn(),
    removeQueries: jest.fn(),
    setQueryData: jest.fn(),
  };

  beforeEach(() => {
    queryClient.invalidateQueries.mockReset();
    queryClient.removeQueries.mockReset();
    queryClient.setQueryData.mockReset();
    mockedUseQueryClient.mockReturnValue(queryClient as unknown as ReturnType<typeof useQueryClient>);
    mockedCreateBill.mockReset();
    mockedDeleteBill.mockReset();
    mockedCreateBillApiMutationInput.mockClear();
    mockedDeleteBillApiMutationInput.mockClear();
    mockedUseOfflineAwareFeatureWrite.mockReset();
    mockedShowQueuedOfflineAlert.mockReset();
  });

  async function renderHook(): Promise<{
    hook: ReturnType<typeof useBillWrites>;
    renderer: ReactTestRenderer;
  }> {
    let hook: ReturnType<typeof useBillWrites> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useBillWrites();
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

  it('runs Bill creation online and applies Bill cache effects', async () => {
    const savedBill = {
      id: 'bill_1',
      title: 'Dinner',
      restaurantName: 'Dinner',
      createdByUserId: 'user_1',
      extrasSplitMode: 'equal',
      fees: 0,
      items: [],
      participants: [],
      status: 'open',
      tax: 0,
      tip: 0,
      createdAt: '2026-05-19T12:00:00.000Z',
      updatedAt: '2026-05-19T12:00:00.000Z',
    } as Awaited<ReturnType<typeof createBill>>;
    mockedCreateBill.mockResolvedValue(savedBill);
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    const input = {
      createdByUserId: 'user_1',
      extrasSplitMode: 'equal' as const,
      items: [],
      participants: [],
      restaurantName: 'Dinner',
      tax: 0,
      tip: 0,
      fees: 0,
      title: 'Dinner',
      totalAmount: 0,
    };

    let result: Awaited<ReturnType<typeof hook.createBill>> | undefined;
    await act(async () => {
      result = await hook.createBill(input);
    });

    expect(mockedCreateBillApiMutationInput).toHaveBeenCalledWith(input);
    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'bill.create',
        offline: expect.objectContaining({
          strategy: 'api',
          input: expect.objectContaining({
            method: 'POST',
            body: input,
          }),
        }),
      }),
    );
    expect(mockedCreateBill).toHaveBeenCalledWith(input);
    expect(queryClient.setQueryData).toHaveBeenCalledWith(billsQueryKeys.detail('bill_1'), savedBill);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: billsQueryKeys.root });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: billsQueryKeys.detail('bill_1') });
    expect(mockedShowQueuedOfflineAlert).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'completed', result: savedBill });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues Bill creation through the replay payload and applies queued cache effects', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();
    const input = {
      createdByUserId: 'user_1',
      extrasSplitMode: 'equal' as const,
      items: [],
      participants: [],
      restaurantName: 'Dinner',
      tax: 0,
      tip: 0,
      fees: 0,
      title: 'Dinner',
      totalAmount: 0,
    };

    let result: Awaited<ReturnType<typeof hook.createBill>> | undefined;
    await act(async () => {
      result = await hook.createBill(input);
    });

    expect(mockedCreateBillApiMutationInput).toHaveBeenCalledWith(input);
    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'bill.create',
        offline: expect.objectContaining({
          strategy: 'api',
          input: expect.objectContaining({
            method: 'POST',
            body: input,
          }),
        }),
      }),
    );
    expect(mockedCreateBill).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: billsQueryKeys.root });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith({
      analyticsSource: 'useBillWrites',
      subject: 'Bill',
    });
    expect(result).toEqual({ status: 'queued' });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('removes Bill detail cache after queued delete', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    let result: Awaited<ReturnType<typeof hook.deleteBill>> | undefined;
    await act(async () => {
      result = await hook.deleteBill({ billId: 'bill_1' });
    });

    expect(mockedDeleteBillApiMutationInput).toHaveBeenCalledWith('bill_1');
    expect(mockedDeleteBill).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: billsQueryKeys.root });
    expect(queryClient.removeQueries).toHaveBeenCalledWith({ queryKey: billsQueryKeys.detail('bill_1') });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith('Bill delete');
    expect(result).toEqual({ status: 'queued' });

    await act(async () => {
      renderer.unmount();
    });
  });
});

import { getBillById } from '../features/store/billsStore';
import { sendApiRequest } from '../features/store/pocketbaseGateway';
import { pb } from '../lib/pocketbase';

jest.mock('../features/store/pocketbaseGateway', () => ({
  sendApiRequest: jest.fn(),
}));

jest.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: {
      record: {
        collectionId: 'users',
        collectionName: 'users',
        id: 'user_1',
      },
    },
  },
}));

const mockedSendApiRequest = sendApiRequest as jest.MockedFunction<typeof sendApiRequest>;
const mockedPocketBase = pb as typeof pb & {
  authStore: {
    record: { collectionId: string; collectionName: string; id: string } | null;
  };
};

describe('billsStore.getBillById', () => {
  beforeEach(() => {
    mockedSendApiRequest.mockReset();
    mockedPocketBase.authStore.record = {
      collectionId: 'users',
      collectionName: 'users',
      id: 'user_1',
    };
  });

  it('maps payment reminder eligibility onto bill participants', async () => {
    mockedSendApiRequest.mockResolvedValue({
      createdAt: '2026-05-19T12:00:00.000Z',
      createdByUserId: 'user_1',
      extrasSplitMode: 'equal',
      fees: 0,
      id: 'bill_1',
      items: [],
      participants: [
        {
          amountOwed: 10,
          id: 'participant_1',
          name: 'Alex',
          paidStatus: 'pending',
          paymentReminderAvailable: true,
          paymentReminderAvailableAt: null,
          userId: 'user_2',
        },
        {
          amountOwed: 12,
          id: 'participant_2',
          name: 'Sam',
          paidStatus: 'pending',
          paymentReminderAvailable: false,
          paymentReminderAvailableAt: '2026-05-26T12:00:00.000Z',
          userId: 'user_3',
        },
      ],
      restaurantName: 'Dinner',
      splitMode: 'even',
      status: 'open',
      tax: 0,
      tip: 0,
      title: 'Dinner',
      totalAmount: 22,
      updatedAt: '2026-05-19T12:00:00.000Z',
    });

    await expect(getBillById('bill_1')).resolves.toMatchObject({
      participants: [
        {
          id: 'participant_1',
          paymentReminderAvailable: true,
          paymentReminderAvailableAt: null,
        },
        {
          id: 'participant_2',
          paymentReminderAvailable: false,
          paymentReminderAvailableAt: '2026-05-26T12:00:00.000Z',
        },
      ],
    });
  });
});

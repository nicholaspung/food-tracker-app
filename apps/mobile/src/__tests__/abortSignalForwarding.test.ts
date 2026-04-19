import { listHomeFeedPage } from '../features/store/homeFeedPagination';
import { listFriendsPage } from '../features/store/friendsStore';
import { getNoteDetail, listNotesOverviewPage } from '../features/store/notesStore';
import { listRestaurantListsPage } from '../features/store/restaurantListsStore';
import {
  getAuthenticatedUserIdOrNull,
  sendApiRequest,
} from '../features/store/pocketbaseGateway';

jest.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: {
      record: {
        id: 'user_1',
      },
      token: 'test-token',
    },
    collection: jest.fn(),
  },
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  getAuthenticatedUserIdOrNull: jest.fn(() => 'user_1'),
  getCollectionCount: jest.fn(),
  listCollectionPage: jest.fn(),
  listCollectionRecords: jest.fn(),
  sendApiRequest: jest.fn(),
}));

const mockedGetAuthenticatedUserIdOrNull = getAuthenticatedUserIdOrNull as jest.MockedFunction<
  typeof getAuthenticatedUserIdOrNull
>;
const mockedSendApiRequest = sendApiRequest as jest.MockedFunction<typeof sendApiRequest>;

describe('abort signal forwarding', () => {
  beforeEach(() => {
    mockedGetAuthenticatedUserIdOrNull.mockReset();
    mockedGetAuthenticatedUserIdOrNull.mockReturnValue('user_1');
    mockedSendApiRequest.mockReset();
  });

  it('forwards AbortSignal through the home feed api loader', async () => {
    const abortController = new AbortController();

    mockedSendApiRequest.mockResolvedValue({
      cursor: undefined,
      hasNextPage: false,
      items: [],
      photoPreviews: [],
      totalQuickTracks: 0,
      totalVisits: 0,
    });

    await listHomeFeedPage({
      pageSize: 20,
      scope: 'friends',
      search: 'pizza',
      signal: abortController.signal,
      sort: 'tracked',
      typeFilter: 'all',
    });

    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/home-feed?page=1&pageSize=20&scope=friends&typeFilter=all&sort=tracked&search=pizza',
      {
        method: 'GET',
        signal: abortController.signal,
      },
    );
  });

  it('forwards AbortSignal through friends, notes, and lists page loaders', async () => {
    const abortController = new AbortController();

    mockedSendApiRequest
      .mockResolvedValueOnce({
        hasNextPage: false,
        items: [],
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      })
      .mockResolvedValueOnce({
        note: {
          content: 'Linked note',
          createdAt: '2026-01-01T00:00:00.000Z',
          id: 'note_1',
          status: 'draft',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        photos: [],
      })
      .mockResolvedValueOnce({
        hasNextPage: false,
        items: [],
        page: 1,
        pageSize: 20,
        summary: {
          allCount: 0,
          draftCount: 0,
          usedCount: 0,
        },
        totalItems: 0,
        totalPages: 0,
      })
      .mockResolvedValueOnce({
        hasNextPage: false,
        items: [],
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      });

    await listFriendsPage({
      page: 1,
      pageSize: 20,
      search: 'sam',
      section: 'friends',
      signal: abortController.signal,
    });
    await listNotesOverviewPage({
      page: 1,
      pageSize: 20,
      search: 'spicy',
      signal: abortController.signal,
      status: 'draft',
    });
    await getNoteDetail('note_1', {
      signal: abortController.signal,
    });
    await listRestaurantListsPage({
      page: 1,
      pageSize: 20,
      scope: 'friends',
      search: 'ramen',
      signal: abortController.signal,
    });

    expect(mockedSendApiRequest).toHaveBeenNthCalledWith(
      1,
      '/api/friends?page=1&pageSize=20&section=friends&search=sam',
      {
        method: 'GET',
        signal: abortController.signal,
      },
    );
    expect(mockedSendApiRequest).toHaveBeenNthCalledWith(
      2,
      '/api/notes/overview?page=1&pageSize=20&status=draft&search=spicy',
      {
        method: 'GET',
        signal: abortController.signal,
      },
    );
    expect(mockedSendApiRequest).toHaveBeenNthCalledWith(
      3,
      '/api/notes/note_1',
      {
        method: 'GET',
        signal: abortController.signal,
      },
    );
    expect(mockedSendApiRequest).toHaveBeenNthCalledWith(
      4,
      '/api/restaurant-lists?scope=friends&page=1&pageSize=20&search=ramen',
      {
        method: 'GET',
        signal: abortController.signal,
      },
    );
  });
});

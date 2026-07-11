import {
  homeFeedMapQueryKeys,
  listHomeFeedMapPointDetails,
  listHomeFeedMapPoints,
} from '../features/store/homeFeedMapQuery';
import { sendApiRequest } from '../features/store/pocketbaseGateway';

jest.mock('../features/store/pocketbaseGateway', () => ({
  sendApiRequest: jest.fn(),
}));

const mockedSendApiRequest = sendApiRequest as jest.MockedFunction<typeof sendApiRequest>;
const viewport = {
  crossesAntimeridian: true,
  east: -175,
  identity: '-10.00:170.00:10.00:-175.00:wrap',
  north: 10,
  south: -10,
  west: 170,
};

describe('home feed map queries', () => {
  beforeEach(() => {
    mockedSendApiRequest.mockReset();
  });

  it('separates detail caches by every request-shaping input', () => {
    const mineKey = homeFeedMapQueryKeys.detail(
      'user-1', ['visit:visit-1'], 'mine', 'visits', 'created', '', viewport.identity,
    );
    const friendsKey = homeFeedMapQueryKeys.detail(
      'user-1', ['visit:visit-1'], 'friends', 'visits', 'created', '', viewport.identity,
    );

    expect(friendsKey).not.toEqual(mineKey);
  });

  it('requests lightweight markers for normalized viewport bounds and forwards cancellation', async () => {
    const abortController = new AbortController();
    mockedSendApiRequest.mockResolvedValue({
      omittedWithoutCoordinates: 0,
      points: [
        {
          eventAt: '2026-07-10T12:00:00.000Z',
          id: 'visit_visit-1',
          latitude: 1,
          longitude: 179,
          recordId: 'visit-1',
          restaurantName: 'Dateline Diner',
          source: 'visit',
        },
        {
          eventAt: '2026-07-10T12:00:00.000Z',
          id: 'visit_invalid',
          latitude: 0,
          longitude: 0,
          recordId: 'invalid',
          restaurantName: 'Invalid',
          source: 'visit',
        },
      ],
      totalEntries: 2,
    });

    await expect(listHomeFeedMapPoints({
      scope: 'friends',
      search: ' sushi ',
      signal: abortController.signal,
      sort: 'created',
      typeFilter: 'all',
      viewport,
    })).resolves.toMatchObject({
      points: [{ recordId: 'visit-1' }],
      totalEntries: 2,
    });

    expect(mockedSendApiRequest).toHaveBeenCalledWith(
      '/api/home-feed/map-points?scope=friends&typeFilter=all&sort=created&search=sushi&north=10&south=-10&west=170&east=-175',
      {
        method: 'GET',
        signal: abortController.signal,
      },
    );
  });

  it('loads selected marker detail separately with the active spatial filters', async () => {
    const abortController = new AbortController();
    mockedSendApiRequest.mockResolvedValue({ photoPreviews: [], points: [] });

    await listHomeFeedMapPointDetails({
      points: [{ recordId: 'visit-1', source: 'visit' }],
      scope: 'mine',
      search: ' ramen ',
      signal: abortController.signal,
      sort: 'tracked',
      typeFilter: 'visits',
      viewport,
    });

    expect(mockedSendApiRequest).toHaveBeenCalledWith('/api/home-feed/map-point-details', {
      body: {
        east: -175,
        north: 10,
        points: [{ recordId: 'visit-1', source: 'visit' }],
        scope: 'mine',
        search: 'ramen',
        sort: 'tracked',
        south: -10,
        typeFilter: 'visits',
        west: 170,
      },
      method: 'POST',
      signal: abortController.signal,
    });
  });

  it('chunks large selected groups without silently dropping marker detail', async () => {
    mockedSendApiRequest.mockResolvedValue({ photoPreviews: [], points: [] });

    await listHomeFeedMapPointDetails({
      points: Array.from({ length: 201 }, (_, index) => ({
        recordId: `visit-${index}`,
        source: 'visit' as const,
      })),
      scope: 'mine',
      sort: 'created',
      typeFilter: 'visits',
      viewport,
    });

    expect(mockedSendApiRequest).toHaveBeenCalledTimes(3);
    expect((mockedSendApiRequest.mock.calls[0]?.[1]?.body as { points: unknown[] }).points).toHaveLength(100);
    expect((mockedSendApiRequest.mock.calls[1]?.[1]?.body as { points: unknown[] }).points).toHaveLength(100);
    expect((mockedSendApiRequest.mock.calls[2]?.[1]?.body as { points: unknown[] }).points).toHaveLength(1);
  });
});

import { loadHomeFeedPageWithSources } from '../features/store/homeFeedPagination';

interface MockFeedRecord {
  eventAt: string;
  id: string;
}

function createMockFeedFetcher(records: MockFeedRecord[]) {
  const calls: { page: number; pageSize: number }[] = [];

  return {
    calls,
    fetchPage: async (page: number, pageSize: number) => {
      const start = (page - 1) * pageSize;
      const items = records.slice(start, start + pageSize);
      calls.push({ page, pageSize });

      return {
        items,
        totalItems: records.length,
        hasNextPage: start + items.length < records.length,
      };
    },
  };
}

describe('loadHomeFeedPageWithSources', () => {
  it('reuses buffered items on the next page before fetching the same source again', async () => {
    const visitFetcher = createMockFeedFetcher([
      { eventAt: '2026-04-10T12:00:00Z', id: 'visit-1' },
      { eventAt: '2026-04-09T12:00:00Z', id: 'visit-2' },
      { eventAt: '2026-04-08T12:00:00Z', id: 'visit-3' },
      { eventAt: '2026-04-07T12:00:00Z', id: 'visit-4' },
    ]);
    const quickTrackFetcher = createMockFeedFetcher([
      { eventAt: '2026-04-08T18:00:00Z', id: 'quick-track-1' },
      { eventAt: '2026-04-06T12:00:00Z', id: 'quick-track-2' },
      { eventAt: '2026-04-05T12:00:00Z', id: 'quick-track-3' },
      { eventAt: '2026-04-04T12:00:00Z', id: 'quick-track-4' },
    ]);

    const firstPage = await loadHomeFeedPageWithSources({
      fetchQuickTracksPage: quickTrackFetcher.fetchPage,
      fetchVisitsPage: visitFetcher.fetchPage,
      getQuickTrackEventAt: (item) => item.eventAt,
      getVisitEventAt: (item) => item.eventAt,
      loadQuickTracks: true,
      loadVisits: true,
      pageSize: 3,
      quickTrackBatchSize: 2,
      visitBatchSize: 2,
    });

    expect(firstPage.items.map((item) => ('visit' in item ? item.visit.id : item.quickTrack.id))).toEqual([
      'visit-1',
      'visit-2',
      'quick-track-1',
    ]);
    expect(visitFetcher.calls).toEqual([
      { page: 1, pageSize: 2 },
      { page: 2, pageSize: 2 },
    ]);
    expect(quickTrackFetcher.calls).toEqual([{ page: 1, pageSize: 2 }]);

    const secondPage = await loadHomeFeedPageWithSources({
      cursor: firstPage.cursor,
      fetchQuickTracksPage: quickTrackFetcher.fetchPage,
      fetchVisitsPage: visitFetcher.fetchPage,
      getQuickTrackEventAt: (item) => item.eventAt,
      getVisitEventAt: (item) => item.eventAt,
      loadQuickTracks: true,
      loadVisits: true,
      pageSize: 3,
      quickTrackBatchSize: 2,
      visitBatchSize: 2,
    });

    expect(secondPage.items.map((item) => ('visit' in item ? item.visit.id : item.quickTrack.id))).toEqual([
      'visit-3',
      'visit-4',
      'quick-track-2',
    ]);
    expect(visitFetcher.calls).toEqual([
      { page: 1, pageSize: 2 },
      { page: 2, pageSize: 2 },
    ]);
    expect(quickTrackFetcher.calls).toEqual([{ page: 1, pageSize: 2 }]);
  });

  it('tops up only the dominant source instead of fetching full windows from both sources', async () => {
    const visitFetcher = createMockFeedFetcher(
      Array.from({ length: 24 }, (_, index) => ({
        eventAt: `2026-04-${String(30 - index).padStart(2, '0')}T12:00:00Z`,
        id: `visit-${index + 1}`,
      })),
    );
    const quickTrackFetcher = createMockFeedFetcher(
      Array.from({ length: 24 }, (_, index) => ({
        eventAt: `2026-03-${String(30 - index).padStart(2, '0')}T12:00:00Z`,
        id: `quick-track-${index + 1}`,
      })),
    );

    const page = await loadHomeFeedPageWithSources({
      fetchQuickTracksPage: quickTrackFetcher.fetchPage,
      fetchVisitsPage: visitFetcher.fetchPage,
      getQuickTrackEventAt: (item) => item.eventAt,
      getVisitEventAt: (item) => item.eventAt,
      loadQuickTracks: true,
      loadVisits: true,
      pageSize: 20,
      quickTrackBatchSize: 10,
      visitBatchSize: 10,
    });

    expect(page.items).toHaveLength(20);
    expect(page.items.every((item) => item.source === 'visit')).toBe(true);
    expect(visitFetcher.calls).toEqual([
      { page: 1, pageSize: 10 },
      { page: 2, pageSize: 10 },
    ]);
    expect(quickTrackFetcher.calls).toEqual([{ page: 1, pageSize: 10 }]);
  });
});

import { resolveFeatureBrowseState } from '../features/store/featureBrowseState';

describe('resolveFeatureBrowseState', () => {
  it('treats read failures as blocking only when no cached data exists', () => {
    expect(
      resolveFeatureBrowseState({
        hasCachedData: false,
        isError: true,
        isFetching: false,
        isLoading: false,
        isSuccess: false,
        items: [],
      }),
    ).toMatchObject({
      hasBlockingError: true,
      hasRefreshError: false,
      showEmpty: false,
    });

    expect(
      resolveFeatureBrowseState({
        hasCachedData: true,
        isError: true,
        isFetching: false,
        isLoading: false,
        isSuccess: true,
        items: ['cached'],
      }),
    ).toMatchObject({
      hasBlockingError: false,
      hasRefreshError: true,
      hasItems: true,
      showEmpty: false,
    });
  });

  it('keeps refresh errors non-blocking when extra fallback state is present', () => {
    expect(
      resolveFeatureBrowseState({
        extraRefreshError: true,
        hasCachedData: true,
        isError: false,
        isFetching: false,
        isLoading: false,
        isSuccess: true,
        items: ['cached'],
      }),
    ).toMatchObject({
      hasBlockingError: false,
      hasRefreshError: true,
      showEmpty: false,
    });
  });

  it('shows empty state only after a successful resolved read by default', () => {
    expect(
      resolveFeatureBrowseState({
        hasCachedData: true,
        isError: false,
        isFetching: false,
        isLoading: false,
        isSuccess: true,
        items: [],
      }).showEmpty,
    ).toBe(true);

    expect(
      resolveFeatureBrowseState({
        hasCachedData: true,
        isError: false,
        isFetching: true,
        isLoading: false,
        isSuccess: true,
        items: [],
      }).showEmpty,
    ).toBe(false);
  });
});

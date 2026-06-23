import { useEffect } from 'react';
import { act, create } from 'react-test-renderer';

import { useQueryListState } from '../hooks/useListQueryState';

interface ProbeProps {
  data: readonly string[] | undefined;
  isError: boolean;
  isFetching?: boolean;
  isLoading?: boolean;
  isSuccess?: boolean;
  onState: (state: ReturnType<typeof useQueryListState<string>>) => void;
}

function Probe({
  data,
  isError,
  isFetching = false,
  isLoading = false,
  isSuccess = false,
  onState,
}: ProbeProps) {
  const state = useQueryListState({
    data,
    isError,
    isFetching,
    isLoading,
    isSuccess,
  });

  useEffect(() => {
    onState(state);
  }, [onState, state]);

  return null;
}

describe('useQueryListState', () => {
  it('treats first-load failures without data as blocking errors', async () => {
    const onState = jest.fn();

    await act(async () => {
      create(<Probe data={undefined} isError onState={onState} />);
    });

    expect(onState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hasBlockingError: true,
        hasRefreshError: false,
        items: [],
      }),
    );
  });

  it('treats successful empty results as resolved empty data', async () => {
    const onState = jest.fn();

    await act(async () => {
      create(<Probe data={[]} isError={false} isSuccess onState={onState} />);
    });

    expect(onState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hasBlockingError: false,
        hasRefreshError: false,
        hasResolvedData: true,
        items: [],
      }),
    );
  });
});

import { useCallback, useEffect, useRef, useState } from 'react';

export function usePullToRefreshState(isRefreshActive: boolean) {
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const hasObservedRefreshActiveRef = useRef(false);
  const isRefreshActiveRef = useRef(isRefreshActive);

  useEffect(() => {
    isRefreshActiveRef.current = isRefreshActive;

    if (!isPullRefreshing) {
      if (!isRefreshActive) {
        hasObservedRefreshActiveRef.current = false;
      }
      return;
    }

    if (isRefreshActive) {
      hasObservedRefreshActiveRef.current = true;
      return;
    }

    if (hasObservedRefreshActiveRef.current) {
      hasObservedRefreshActiveRef.current = false;
      setIsPullRefreshing(false);
    }
  }, [isPullRefreshing, isRefreshActive]);

  const runPullRefresh = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    hasObservedRefreshActiveRef.current = isRefreshActiveRef.current;
    setIsPullRefreshing(true);

    try {
      return await action();
    } finally {
      if (!hasObservedRefreshActiveRef.current && !isRefreshActiveRef.current) {
        setIsPullRefreshing(false);
      }
    }
  }, []);

  return {
    isPullRefreshing,
    runPullRefresh,
  };
}

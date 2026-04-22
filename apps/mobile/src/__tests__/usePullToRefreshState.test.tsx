import React from 'react';
import { act, create } from 'react-test-renderer';

import { usePullToRefreshState } from '../hooks/usePullToRefreshState';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

describe('usePullToRefreshState', () => {
  let latestHook: ReturnType<typeof usePullToRefreshState> | null = null;

  function HookHarness({ isRefreshActive }: { isRefreshActive: boolean }) {
    latestHook = usePullToRefreshState(isRefreshActive);

    return React.createElement('HookState', {
      isPullRefreshing: latestHook.isPullRefreshing,
    });
  }

  beforeEach(() => {
    latestHook = null;
  });

  it('keeps the spinner active until an observed refetch becomes idle', async () => {
    const refetchDeferred = createDeferred<void>();
    let renderer: any = null;

    await act(async () => {
      renderer = create(React.createElement(HookHarness, { isRefreshActive: false }));
    });

    let refreshPromise: Promise<void> | null = null;
    act(() => {
      refreshPromise = latestHook?.runPullRefresh(() => refetchDeferred.promise) ?? null;
    });

    expect(renderer.root.findByType('HookState').props.isPullRefreshing).toBe(true);

    await act(async () => {
      renderer.update(React.createElement(HookHarness, { isRefreshActive: true }));
      await Promise.resolve();
    });

    expect(renderer.root.findByType('HookState').props.isPullRefreshing).toBe(true);

    await act(async () => {
      refetchDeferred.resolve();
      await refreshPromise;
    });

    expect(renderer.root.findByType('HookState').props.isPullRefreshing).toBe(true);

    await act(async () => {
      renderer.update(React.createElement(HookHarness, { isRefreshActive: false }));
      await Promise.resolve();
    });

    expect(renderer.root.findByType('HookState').props.isPullRefreshing).toBe(false);
  });

  it('clears the spinner if the refresh action settles without an active refetch signal', async () => {
    const refetchDeferred = createDeferred<void>();
    let renderer: any = null;

    await act(async () => {
      renderer = create(React.createElement(HookHarness, { isRefreshActive: false }));
    });

    let refreshPromise: Promise<void> | null = null;
    act(() => {
      refreshPromise = latestHook?.runPullRefresh(() => refetchDeferred.promise) ?? null;
    });

    expect(renderer.root.findByType('HookState').props.isPullRefreshing).toBe(true);

    await act(async () => {
      refetchDeferred.resolve();
      await refreshPromise;
    });

    expect(renderer.root.findByType('HookState').props.isPullRefreshing).toBe(false);
  });

  it('resets its internal observation state across repeated pull refresh attempts', async () => {
    const firstRefetchDeferred = createDeferred<void>();
    const secondRefetchDeferred = createDeferred<void>();
    let renderer: any = null;

    await act(async () => {
      renderer = create(React.createElement(HookHarness, { isRefreshActive: false }));
    });

    let firstRefreshPromise: Promise<void> | null = null;
    act(() => {
      firstRefreshPromise = latestHook?.runPullRefresh(() => firstRefetchDeferred.promise) ?? null;
    });

    await act(async () => {
      renderer.update(React.createElement(HookHarness, { isRefreshActive: true }));
      await Promise.resolve();
    });

    await act(async () => {
      firstRefetchDeferred.resolve();
      await firstRefreshPromise;
    });

    await act(async () => {
      renderer.update(React.createElement(HookHarness, { isRefreshActive: false }));
      await Promise.resolve();
    });

    expect(renderer.root.findByType('HookState').props.isPullRefreshing).toBe(false);

    let secondRefreshPromise: Promise<void> | null = null;
    act(() => {
      secondRefreshPromise = latestHook?.runPullRefresh(() => secondRefetchDeferred.promise) ?? null;
    });

    expect(renderer.root.findByType('HookState').props.isPullRefreshing).toBe(true);

    await act(async () => {
      secondRefetchDeferred.resolve();
      await secondRefreshPromise;
    });

    expect(renderer.root.findByType('HookState').props.isPullRefreshing).toBe(false);
  });
});

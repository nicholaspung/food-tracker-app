import { createAuthenticatedLocalStateReset } from '../providers/auth/authenticatedLocalStateReset';

jest.mock('../lib/logger', () => ({
  logger: { warn: jest.fn() },
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

describe('authenticated local state reset', () => {
  it('waits until safe, then clears every authenticated store through one interface', async () => {
    let release = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const clearMemoryCache = jest.fn();
    const clearPersistedCache = jest.fn().mockRejectedValue(new Error('storage unavailable'));
    const discardQueuedMutations = jest.fn().mockResolvedValue(2);
    const reset = createAuthenticatedLocalStateReset({
      clearMemoryCache,
      clearPersistedCache,
      discardQueuedMutations,
      waitUntilSafe: () => barrier,
    });

    const pendingReset = reset.reset('logout');
    expect(clearMemoryCache).not.toHaveBeenCalled();

    release();
    await pendingReset;

    expect(clearMemoryCache).toHaveBeenCalledTimes(1);
    expect(clearPersistedCache).toHaveBeenCalledTimes(1);
    expect(discardQueuedMutations).toHaveBeenCalledWith('logout');
  });

  it('does not clear shared state after its composition shell becomes inactive', async () => {
    const clearMemoryCache = jest.fn();
    const reset = createAuthenticatedLocalStateReset({
      clearMemoryCache,
      clearPersistedCache: jest.fn(),
      discardQueuedMutations: jest.fn(),
      isActive: () => false,
    });

    await reset.reset('auth_change');

    expect(clearMemoryCache).not.toHaveBeenCalled();
  });
});

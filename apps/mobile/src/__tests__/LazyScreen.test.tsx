import React from 'react';
import { act, create } from 'react-test-renderer';

import { createLazyScreen } from '../navigation/LazyScreen';

const mockReact = React;

jest.mock('react-native', () => ({
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../theme', () => ({
  createThemedStyles: () => () => ({
    state: {},
  }),
}));

jest.mock('../components/shared/ErrorState', () => ({
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
}));

jest.mock('../components/shared/LoadingState', () => ({
  LoadingState: (props: Record<string, unknown>) => mockReact.createElement('LoadingState', props),
}));

describe('createLazyScreen', () => {
  it('defers loading until render and shows a loading state while the module resolves', async () => {
    let resolveModule: ((module: { default: React.ComponentType<{ value: string }> }) => void) | undefined;
    const load = jest.fn(
      () =>
        new Promise<{ default: React.ComponentType<{ value: string }> }>((resolve) => {
          resolveModule = resolve;
        }),
    );
    const DeferredScreen = createLazyScreen('Deferred', load);

    expect(load).not.toHaveBeenCalled();

    let renderer: any;
    act(() => {
      renderer = create(<DeferredScreen value="loaded value" />);
    });

    expect(load).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findByType('LoadingState').props.label).toBe('Loading screen...');

    await act(async () => {
      resolveModule?.({
        default: ({ value }) => mockReact.createElement('LoadedScreen', { value }),
      });
    });

    expect(renderer!.root.findByType('LoadedScreen').props.value).toBe('loaded value');
  });

  it('catches a rejected module load and shows a stable route error state', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const DeferredScreen = createLazyScreen('BrokenRoute', () => Promise.reject(new Error('load failed')));

    let renderer: any;
    await act(async () => {
      renderer = create(<DeferredScreen />);
    });

    expect(renderer!.root.findByType('ErrorState').props).toMatchObject({
      analyticsProps: { screenName: 'BrokenRoute' },
      analyticsSource: 'LazyScreen',
      description: 'Restart the app to try again.',
      title: 'Screen could not be loaded',
    });
    consoleError.mockRestore();
  });
});

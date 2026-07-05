import React from 'react';
import { act, create } from 'react-test-renderer';

import type { TastingSessionRecord } from '../features';
import { TastingSessionLifecycleShell } from '../screens/tastingSessions/TastingSessionLifecycleShell';

const mockReact = React;

jest.mock('../components/shared', () => ({
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  FeatureDetailScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureDetailScreenScaffold', props, children),
  FeatureFormScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureFormScreenScaffold', props, children),
}));

const session = {
  id: 'session_1',
  name: 'Dinner crawl',
} as TastingSessionRecord;
type TestRenderer = ReturnType<typeof create> & { root: any };

function renderShell(props: Partial<React.ComponentProps<typeof TastingSessionLifecycleShell>> = {}) {
  return create(
    <TastingSessionLifecycleShell
      isError={false}
      loadingTitle="Loading lobby"
      onBackPress={() => {}}
      session={session}
      title="Tasting Lobby"
      {...props}
    >
      {(availableSession) => mockReact.createElement('LoadedBody', { sessionName: availableSession.name })}
    </TastingSessionLifecycleShell>,
  ) as TestRenderer;
}

describe('TastingSessionLifecycleShell', () => {
  it('renders the shared blocking unavailable state when the query failed without a session', async () => {
    let renderer: ReturnType<typeof renderShell> | null = null;

    await act(async () => {
      renderer = renderShell({
        isError: true,
        session: null,
        title: 'Planning',
      });
    });

    const scaffold = renderer!.root.findByType('FeatureDetailScreenScaffold');
    const error = renderer!.root.findByType('ErrorState');

    expect(scaffold.props.title).toBe('Planning');
    expect(error.props).toEqual({
      description: 'Could not load this tasting session.',
      title: 'Session unavailable',
    });
  });

  it('renders the shared loading state while the session is unavailable', async () => {
    let renderer: ReturnType<typeof renderShell> | null = null;

    await act(async () => {
      renderer = renderShell({
        loadingTitle: 'Loading results',
        session: undefined,
        title: 'Results',
      });
    });

    const scaffold = renderer!.root.findByType('FeatureDetailScreenScaffold');
    const emptyState = renderer!.root.findByType('EmptyState');

    expect(scaffold.props.title).toBe('Results');
    expect(emptyState.props.title).toBe('Loading results');
  });

  it('passes the session to lifecycle body content after the session exists', async () => {
    let renderer: ReturnType<typeof renderShell> | null = null;

    await act(async () => {
      renderer = renderShell();
    });

    const body = renderer!.root.findByType('LoadedBody');

    expect(body.props.sessionName).toBe('Dinner crawl');
    expect(renderer!.root.findAllByType('FeatureDetailScreenScaffold')).toHaveLength(0);
  });

  it('preserves the shared back callback on loading and unavailable shells', async () => {
    const onBackPress = jest.fn();
    let renderer: ReturnType<typeof renderShell> | null = null;

    await act(async () => {
      renderer = renderShell({
        onBackPress,
        session: null,
      });
    });

    renderer!.root.findByType('FeatureDetailScreenScaffold').props.onBackPress();

    expect(onBackPress).toHaveBeenCalledTimes(1);
  });

  it('supports form-style fallback scaffolds for tasting loading states', async () => {
    const onBackPress = jest.fn();
    let renderer: ReturnType<typeof renderShell> | null = null;

    await act(async () => {
      renderer = renderShell({
        loadingTitle: 'Loading tasting',
        onBackPress,
        renderScaffold: ({ children, onBackPress: scaffoldBackPress, title }) =>
          mockReact.createElement(
            'FeatureFormScreenScaffold',
            {
              onBackPress: scaffoldBackPress,
              primaryAction: { disabled: true, label: 'Submit Ratings' },
              title,
            },
            children,
          ),
        session: undefined,
        title: 'Tasting',
      });
    });

    const scaffold = renderer!.root.findByType('FeatureFormScreenScaffold');
    const emptyState = renderer!.root.findByType('EmptyState');

    expect(scaffold.props.title).toBe('Tasting');
    expect(scaffold.props.primaryAction).toMatchObject({
      disabled: true,
      label: 'Submit Ratings',
    });
    expect(emptyState.props.title).toBe('Loading tasting');

    scaffold.props.onBackPress();
    expect(onBackPress).toHaveBeenCalledTimes(1);
  });
});

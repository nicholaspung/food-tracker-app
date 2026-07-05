import React from 'react';
import { act, create } from 'react-test-renderer';

import { FeatureFormReadStateScaffold } from '../components/shared/FeatureFormReadStateScaffold';

const mockReact = React;

jest.mock('../components/shared/EmptyState', () => ({
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
}));

jest.mock('../components/shared/ErrorState', () => ({
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
}));

jest.mock('../components/shared/FeatureFormScreenScaffold', () => ({
  FeatureFormScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureFormScreenScaffold', props, children),
}));

jest.mock('../components/shared/LoadingState', () => ({
  LoadingState: (props: Record<string, unknown>) => mockReact.createElement('LoadingState', props),
}));

jest.mock('../components/shared/Skeleton', () => ({
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
}));

const scaffold = {
  onBackPress: jest.fn(),
  primaryAction: {
    label: 'Save',
    disabled: true,
    onPress: jest.fn(),
  },
  secondaryAction: {
    label: 'Cancel',
    onPress: jest.fn(),
  },
  title: 'Edit Thing',
};

describe('FeatureFormReadStateScaffold', () => {
  it('renders configured loading skeletons inside the form scaffold', () => {
    let renderer: any = null;

    act(() => {
      renderer = create(
        <FeatureFormReadStateScaffold
          loading={{ skeletonHeights: [24, 80] }}
          scaffold={scaffold}
          state="loading"
        />,
      );
    });

    expect(renderer.root.findByType('FeatureFormScreenScaffold').props.title).toBe('Edit Thing');
    expect(
      renderer.root
        .findAllByType('Skeleton')
        .map((node: { props: { height: number } }) => node.props.height),
    ).toEqual([24, 80]);
  });

  it('renders configured blocking error state inside the form scaffold', () => {
    const onRetry = jest.fn();
    let renderer: any = null;

    act(() => {
      renderer = create(
        <FeatureFormReadStateScaffold
          error={{
            description: 'Could not load the record.',
            onRetry,
            title: 'Record unavailable',
          }}
          scaffold={scaffold}
          state="error"
        />,
      );
    });

    expect(renderer.root.findByType('ErrorState').props).toMatchObject({
      description: 'Could not load the record.',
      onRetry,
      title: 'Record unavailable',
    });
  });

  it('renders configured not-found state inside the form scaffold', () => {
    const onAction = jest.fn();
    let renderer: any = null;

    act(() => {
      renderer = create(
        <FeatureFormReadStateScaffold
          empty={{
            actionLabel: 'Back',
            onAction,
            title: 'Record not found',
          }}
          scaffold={scaffold}
          state="empty"
        />,
      );
    });

    expect(renderer.root.findByType('EmptyState').props).toMatchObject({
      actionLabel: 'Back',
      onAction,
      title: 'Record not found',
    });
  });
});

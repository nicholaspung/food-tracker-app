import React from 'react';
import { act, create } from 'react-test-renderer';

import { ConfirmDestructiveModal } from '../components/shared/ConfirmDestructiveModal';

jest.mock('../ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    Modal: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('Modal', props, children),
  };
});

describe('ConfirmDestructiveModal accessibility', () => {
  it('uses its destructive title as the shared modal accessible name', async () => {
    let renderer: any;

    await act(async () => {
      renderer = create(
        <ConfirmDestructiveModal
          confirmLabel="Delete visit"
          description="This cannot be undone."
          onCancel={jest.fn()}
          onConfirm={jest.fn()}
          title="Delete Visit"
          visible
        />,
      );
    });

    expect(renderer.root.findByType('Modal').props.accessibilityLabel).toBe('Delete Visit');
  });
});

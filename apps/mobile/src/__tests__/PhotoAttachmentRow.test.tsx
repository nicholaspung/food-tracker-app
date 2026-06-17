import React from 'react';
import { act, create } from 'react-test-renderer';

import { PhotoAttachmentRow } from '../components/shared/PhotoAttachmentRow';

const mockReact = React;
const theme = {
  colors: {
    background: {
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: {
      default: 'default-border',
      strong: 'strong-border',
    },
    text: {
      secondary: 'secondary-text',
    },
  },
  radii: {
    md: 12,
    pill: 999,
    sm: 8,
  },
  spacing: {
    xs: 8,
  },
} as const;

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    Pressable: ({
      children,
      ...props
    }: Record<string, unknown> & {
      children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    }) =>
      React.createElement(
        'Pressable',
        props,
        typeof children === 'function' ? children({ pressed: false }) : children,
      ),
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(theme, ...args),
  useTheme: () => theme,
}));

jest.mock('../ui', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../ui/AppIcon', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('../components/shared/CachedRemoteImage', () => ({
  CachedRemoteImage: (props: Record<string, unknown>) => mockReact.createElement('CachedRemoteImage', props),
}));

describe('PhotoAttachmentRow', () => {
  it('uses a 44 by 44 remove target while stopping row press propagation', async () => {
    const onRemove = jest.fn();
    const stopPropagation = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <PhotoAttachmentRow
          label="Receipt"
          onPress={jest.fn()}
          onRemove={onRemove}
          uri="file:///receipt.jpg"
        />,
      );
    });

    const removeButton = renderer.root.findByProps({ accessibilityLabel: 'Remove attached photo' });

    expect(removeButton.props.accessibilityRole).toBe('button');
    expect(removeButton.props.style).toMatchObject({ height: 44, width: 44 });

    removeButton.props.onPress({ stopPropagation });

    expect(stopPropagation).toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalled();
  });
});

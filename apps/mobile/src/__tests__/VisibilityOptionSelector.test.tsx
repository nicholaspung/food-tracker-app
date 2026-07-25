import React from 'react';
import { act, create } from 'react-test-renderer';

import { VisibilityOptionSelector } from '../components/shared/VisibilityOptionSelector';

const mockReact = React;
const theme = {
  colors: {
    background: {
      inverse: 'inverse-background',
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: {
      default: 'default-border',
      info: 'info-border',
      strong: 'strong-border',
      subtle: 'subtle-border',
    },
    fill: {
      brand: 'brand-fill',
    },
    status: {
      infoBg: 'info-background',
      infoBorder: 'info-status-border',
      successBg: 'success-background',
      successBorder: 'success-border',
    },
    text: {
      info: 'info-text',
      muted: 'muted-text',
      primary: 'primary-text',
      secondary: 'secondary-text',
      success: 'success-text',
    },
  },
  radii: {
    lg: 16,
    md: 12,
    pill: 999,
  },
  spacing: {
    sm: 12,
    xs: 8,
    xxs: 4,
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

jest.mock('../theme/shadows', () => ({
  createPlatformShadow: () => ({}),
}));

jest.mock('../ui', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../ui/AppIcon', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('../components/shared/StatusPill', () => ({
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
}));

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce(
      (result, entry) => ({ ...result, ...flattenStyle(entry) }),
      {},
    );
  }

  return style && typeof style === 'object' ? style as Record<string, unknown> : {};
}

describe('VisibilityOptionSelector', () => {
  it('keeps compact options at least 44 points tall with selected and disabled states', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <VisibilityOptionSelector
          disabled
          labelOverrides={{ public: 'Visible to the whole community' }}
          onChange={jest.fn()}
          value="friends"
        />,
      );
    });

    const options = renderer.root.findAllByType('Pressable');

    expect(options).toHaveLength(3);
    options.forEach((option: any) => {
      expect(flattenStyle(option.props.style({ pressed: false })).minHeight).toBe(44);
      expect(option.props.disabled).toBe(true);
    });
    expect(options[0].props.accessibilityState).toEqual({ disabled: true, selected: false });
    expect(options[1].props.accessibilityState).toEqual({ disabled: true, selected: true });
    expect(options[2].props.accessibilityState).toEqual({ disabled: true, selected: false });
    expect(renderer.root.findAllByType('Text').at(-1)?.props.numberOfLines).toBeUndefined();
  });

  it('preserves the taller two-option personal layout', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <VisibilityOptionSelector
          onChange={jest.fn()}
          options={['private', 'friends']}
          value="private"
        />,
      );
    });

    const options = renderer.root.findAllByType('Pressable');

    expect(options).toHaveLength(2);
    options.forEach((option: any) => {
      expect(flattenStyle(option.props.style({ pressed: false })).minHeight).toBe(46);
    });
  });
});

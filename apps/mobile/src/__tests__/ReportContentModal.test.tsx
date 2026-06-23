import React from 'react';
import { act, create } from 'react-test-renderer';

import { ReportContentModal } from '../components/shared/ReportContentModal';

const mockReact = React;
const theme = {
  colors: {
    background: {
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: {
      info: 'info-border',
      subtle: 'subtle-border',
    },
    status: {
      infoBg: 'info-background',
    },
    text: {
      info: 'info-text',
      muted: 'muted-text',
      primary: 'primary-text',
    },
  },
  radii: {
    md: 12,
  },
  spacing: {
    md: 16,
    sm: 12,
    xs: 8,
    xxs: 4,
  },
  typography: {
    bodySm: {},
    titleSm: {},
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
    ScrollView: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('ScrollView', props, children),
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
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Modal: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Modal', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../ui/AppIcon', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

describe('ReportContentModal', () => {
  it('announces report reason options as selectable buttons', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <ReportContentModal
          contentLabel="Visit at Sample Cafe"
          contentType="visit"
          isOnline
          notes=""
          onCancel={jest.fn()}
          onChangeNotes={jest.fn()}
          onChangeReasonCode={jest.fn()}
          onSubmit={jest.fn()}
          selectedReasonCode="privacy"
          visible
        />,
      );
    });

	    const reasonToggle = renderer.root.findByProps({ accessibilityLabel: 'Select report reason' });

	    expect(reasonToggle.props.accessibilityState).toEqual({ expanded: false });

	    await act(async () => {
	      reasonToggle.props.onPress();
	    });

	    expect(
	      renderer.root.findByProps({ accessibilityLabel: 'Select report reason' }).props.accessibilityState,
	    ).toEqual({ expanded: true });

    const privacyOption = renderer.root.findByProps({ accessibilityLabel: 'Report reason Privacy issue' });
    const spamOption = renderer.root.findByProps({ accessibilityLabel: 'Report reason Spam' });

    expect(privacyOption.props.accessibilityRole).toBe('button');
    expect(privacyOption.props.accessibilityState).toEqual({ selected: true });
    expect(spamOption.props.accessibilityRole).toBe('button');
    expect(spamOption.props.accessibilityState).toEqual({ selected: false });
  });
});

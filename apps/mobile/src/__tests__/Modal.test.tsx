import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';

import { Modal } from '../ui/Modal';

const mockReact = React;
const mockAnnounceForAccessibility = AccessibilityInfo.announceForAccessibility as jest.Mock;
const theme = {
  colors: {
    background: {
      overlay: 'overlay-background',
      surface: 'surface-background',
    },
    border: {
      default: 'default-border',
    },
  },
  radii: {
    lg: 16,
  },
  sizes: {
    modalMaxWidth: 480,
  },
  spacing: {
    sm: 8,
    md: 16,
    lg: 24,
  },
} as const;

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    AccessibilityInfo: {
      announceForAccessibility: jest.fn(),
    },
    Modal: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('Modal', props, children),
    Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    StyleSheet: {
      absoluteFillObject: {
        bottom: 0,
        left: 0,
        position: 'absolute',
        right: 0,
        top: 0,
      },
      create: (styles: Record<string, unknown>) => styles,
    },
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('../theme', () => ({
  useTheme: () => theme,
}));

jest.mock('../ui/Button', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
}));

jest.mock('../ui/Text', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

describe('Modal', () => {
  beforeEach(() => {
    mockAnnounceForAccessibility.mockReset();
  });

  it('announces its accessible name and exposes a modal-only content boundary', async () => {
    let renderer: any;

    await act(async () => {
      renderer = create(
        <Modal
          accessibilityLabel="Remove saved item confirmation"
          onRequestClose={jest.fn()}
          testID="confirmation-modal"
          title="Remove item?"
          visible
        />,
      );
    });

    const nativeModal = renderer.root.findByType('Modal');
    const content = renderer.root
      .findAllByType('View')
      .find((node: { props: { testID?: string } }) => node.props.testID === 'confirmation-modal');
    const title = renderer.root.findByType('Text');

    expect(content).toBeDefined();
    expect(nativeModal.props.accessibilityViewIsModal).toBe(true);
    expect(nativeModal.props.accessibilityLabel).toBe('Remove saved item confirmation');
    expect(content?.props.accessibilityViewIsModal).toBe(true);
    expect(content?.props.accessible).toBe(false);
    expect(content?.props.importantForAccessibility).toBe('no');
    expect(title.props.accessibilityRole).toBe('header');

    nativeModal.props.onShow();

    expect(mockAnnounceForAccessibility).toHaveBeenCalledWith(
      'Dialog, Remove saved item confirmation',
    );
  });

  it('keeps the dismiss backdrop and content wrapper out of the accessibility controls', async () => {
    const onRequestClose = jest.fn();
    let renderer: any;

    await act(async () => {
      renderer = create(
        <Modal onRequestClose={onRequestClose} testID="example-modal" title="Example" visible>
          <TextInput />
        </Modal>,
      );
    });

    const backdrop = renderer.root.findByType('Pressable');
    const content = renderer.root
      .findAllByType('View')
      .find((node: { props: { testID?: string } }) => node.props.testID === 'example-modal');

    expect(content).toBeDefined();
    expect(backdrop.props.accessibilityElementsHidden).toBe(true);
    expect(backdrop.props.accessible).toBe(false);
    expect(backdrop.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(content?.type).toBe('View');
    expect(content?.props.onPress).toBeUndefined();

    backdrop.props.onPress();
    content?.props.onAccessibilityEscape();
    expect(onRequestClose).toHaveBeenCalledTimes(2);
  });

  it('preserves hardware-back and action behavior', async () => {
    const onRequestClose = jest.fn();
    const onPrimaryPress = jest.fn();
    const onSecondaryPress = jest.fn();
    let renderer: any;

    await act(async () => {
      renderer = create(
        <Modal
          onRequestClose={onRequestClose}
          primaryAction={{ label: 'Delete', onPress: onPrimaryPress }}
          secondaryAction={{ label: 'Cancel', onPress: onSecondaryPress }}
          title="Delete item?"
          visible
        />,
      );
    });

    const nativeModal = renderer.root.findByType('Modal');
    const [secondaryButton, primaryButton] = renderer.root.findAllByType('Button');

    nativeModal.props.onRequestClose();
    secondaryButton.props.onPress();
    primaryButton.props.onPress();

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(onSecondaryPress).toHaveBeenCalledTimes(1);
    expect(onPrimaryPress).toHaveBeenCalledTimes(1);
  });
});

function TextInput() {
  return mockReact.createElement('TextInput', { accessibilityLabel: 'Example input' });
}

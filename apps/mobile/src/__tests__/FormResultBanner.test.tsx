import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';

import { FormResultBanner } from '../components/shared/FormResultBanner';

const mockReact = React;

jest.mock('../ui', () => ({
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

describe('FormResultBanner', () => {
  beforeEach(() => {
    (AccessibilityInfo.announceForAccessibility as jest.Mock).mockClear();
  });

  it('exposes result semantics and announces only changed messages', async () => {
    let renderer: any;

    await act(async () => {
      renderer = create(
        <FormResultBanner message="Reset email sent." tone="success" />,
      );
    });

    const alert = renderer.root.findByProps({
      accessibilityLabel: 'Reset email sent.',
      accessibilityRole: 'alert',
    });

    expect(alert.props.accessibilityLiveRegion).toBe('polite');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.update(
        <FormResultBanner message="Reset email sent." tone="success" />,
      );
    });
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.update(
        <FormResultBanner
          message="Wait before requesting another email."
          tone="warning"
        />,
      );
    });

    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(2);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(
      'Wait before requesting another email.',
    );
  });
});

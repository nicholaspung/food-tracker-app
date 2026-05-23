import React from 'react';
import { act, create } from 'react-test-renderer';
import * as NativeSplashScreen from 'expo-splash-screen';

import { StartupErrorView } from '../components/StartupErrorView';

const mockReact = React;

jest.mock('react-native', () => ({
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
  View: ({ children, onLayout, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', { ...props, onLayout }, children),
}));

jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn(async () => undefined),
}));

describe('StartupErrorView', () => {
  it('renders a visible startup error and hides the native splash on layout', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<StartupErrorView error={new Error('Backend URL is not correct.')} />);
    });

    const screen = renderer.root.findByProps({ testID: 'startup-error-screen' });
    expect(screen).toBeTruthy();
    expect(renderer.root.findByProps({ children: 'Yummy Recs could not start' })).toBeTruthy();
    expect(renderer.root.findByProps({ children: 'Backend URL is not correct.' })).toBeTruthy();

    await act(async () => {
      screen.props.onLayout();
    });

    expect(NativeSplashScreen.hideAsync).toHaveBeenCalled();
  });
});

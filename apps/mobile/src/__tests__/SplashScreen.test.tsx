import React from 'react';
import { act, create } from 'react-test-renderer';

import { SplashScreen } from '../screens/SplashScreen';

const mockReact = React;

jest.mock('../lib/branding', () => ({
  APP_NAME: 'Yummy Recs',
  BRAND_LOGO: 1,
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (theme: Record<string, any>) => Record<string, unknown>) =>
    () =>
      factory({
        colors: {
          button: {
            primaryBg: 'brand-color',
          },
        },
        spacing: {
          xs: 8,
          sm: 12,
          md: 16,
        },
      }),
  useTheme: () => ({
    colors: {
      button: {
        primaryBg: 'brand-color',
      },
    },
  }),
}));

jest.mock('../ui', () => ({
  Screen: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Screen', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

describe('SplashScreen', () => {
  it('renders branded loading content', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<SplashScreen />);
    });

    expect(renderer.root.findByProps({ testID: 'splash-screen' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'splash-logo' }).props.source).toBe(1);
    expect(renderer.root.findByProps({ testID: 'splash-title' }).props.children).toBe('Yummy Recs');
    expect(renderer.root.findByProps({ children: 'Getting things ready...' })).toBeTruthy();
    expect(renderer.root.findByType('ActivityIndicator').props.color).toBe('brand-color');
  });
});

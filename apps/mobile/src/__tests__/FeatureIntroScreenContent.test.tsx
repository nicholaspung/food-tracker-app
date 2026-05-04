import React from 'react';
import { Image } from 'react-native';
import { act, create } from 'react-test-renderer';

import { FeatureIntroScreenContent } from '../components/shared/FeatureIntroScreenContent';

const mockReact = React;

const TEST_THEME = {
  colors: {
    background: {
      muted: 'muted-background',
    },
    border: {
      subtle: 'subtle-border',
    },
    text: {
      brand: 'brand-text',
      info: 'info-text',
      secondary: 'secondary-text',
      success: 'success-text',
      warning: 'warning-text',
    },
  },
  radii: {
    md: 8,
  },
  spacing: {
    xs: 8,
    md: 16,
    lg: 24,
  },
} as const;

jest.mock('../theme', () => ({
  createThemedStyles:
    <Args extends unknown[], Styles>(
      factory: (theme: typeof TEST_THEME, ...args: Args) => Styles,
    ) =>
    (...args: Args) =>
      factory(TEST_THEME, ...args),
  useTheme: () => TEST_THEME,
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) =>
    mockReact.createElement('PageErrorToast', props),
}));

describe('FeatureIntroScreenContent', () => {
  it('renders the shared feature intro layout and actions', async () => {
    const onPrimaryPress = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FeatureIntroScreenContent
          config={{
            analyticsFeature: 'bills',
            description: 'Split bills with friends.',
            destination: 'Bills',
            iconName: 'cash-outline',
            iconTone: 'green',
            imageSource: 1,
            primaryLabel: 'Open Bills',
            subtitle: 'Bills',
            title: 'Split a bill',
          }}
          errorMessage="Could not update onboarding."
          isSubmitting={false}
          onPrimaryPress={onPrimaryPress}
          primaryTestID="primary-button"
        />,
      );
    });

    const buttons = renderer.root.findAllByType('Button');
    expect(buttons.map((button: any) => button.props.label)).toEqual(['Open Bills']);
    expect(buttons[0].props.testID).toBe('primary-button');
    expect(renderer.root.findByType(Image).props.resizeMode).toBe('cover');

    const errorToast = renderer.root.findByType('PageErrorToast');
    expect(errorToast.props.errorMessage).toBe('Could not update onboarding.');

    await act(async () => {
      buttons[0].props.onPress();
    });
    expect(onPrimaryPress).toHaveBeenCalledTimes(1);
  });

  it('renders immersive layout with a contained image and one primary action', async () => {
    const onPrimaryPress = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FeatureIntroScreenContent
          config={{
            analyticsFeature: 'tip_calculator',
            description: 'Estimate tips quickly.',
            destination: 'TipCalculator',
            iconName: 'calculator-outline',
            iconTone: 'green',
            imageSource: 1,
            primaryLabel: 'Open Tip Calculator',
            subtitle: 'Tip Calculator',
            title: 'Calculate tips quickly',
          }}
          errorMessage={null}
          isSubmitting={false}
          layout="immersive"
          onPrimaryPress={onPrimaryPress}
          primaryTestID="primary-button"
        />,
      );
    });

    const buttons = renderer.root.findAllByType('Button');
    expect(buttons.map((button: any) => button.props.label)).toEqual(['Open Tip Calculator']);
    expect(renderer.root.findByType(Image).props.resizeMode).toBe('contain');
  });

  it('calls the primary action from immersive profile replay content', async () => {
    const onPrimaryPress = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FeatureIntroScreenContent
          config={{
            analyticsFeature: 'tip_calculator',
            description: 'Estimate tips quickly.',
            destination: 'TipCalculator',
            iconName: 'calculator-outline',
            iconTone: 'green',
            imageSource: 1,
            primaryLabel: 'Open Tip Calculator',
            subtitle: 'Tip Calculator',
            title: 'Calculate tips quickly',
          }}
          errorMessage={null}
          isSubmitting={false}
          layout="immersive"
          onPrimaryPress={onPrimaryPress}
          primaryTestID="primary-button"
        />,
      );
    });

    const buttons = renderer.root.findAllByType('Button');
    expect(buttons.map((button: any) => button.props.label)).toEqual(['Open Tip Calculator']);
    expect(buttons[0].props.testID).toBe('primary-button');
    expect(renderer.root.findByType(Image).props.resizeMode).toBe('contain');

    await act(async () => {
      buttons[0].props.onPress();
    });
    expect(onPrimaryPress).toHaveBeenCalledTimes(1);
  });
});

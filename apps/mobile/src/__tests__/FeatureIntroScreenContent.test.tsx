import React from 'react';
import { Image } from 'react-native';
import { act, create } from 'react-test-renderer';

import { FeatureIntroScreenContent } from '../components/shared/FeatureIntroScreenContent';

const mockReact = React;

const TEST_THEME = {
  colors: {
    background: {
      muted: 'muted-background',
      surface: 'surface-background',
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
    pill: 999,
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

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('expo-video', () => ({
  VideoView: (props: Record<string, unknown>) => mockReact.createElement('VideoView', props),
  useVideoPlayer: (source: string, setup?: (player: Record<string, unknown> & { play: jest.Mock }) => void) => {
    const player = { play: jest.fn() };
    setup?.(player);
    return { ...player, source };
  },
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
            media: { posterSource: 1, videoUri: 'https://yummyrecs.com/tutorials/tip-calculator.mp4' },
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

  it('renders the icon fallback when no image source is configured', async () => {
    const onPrimaryPress = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FeatureIntroScreenContent
          config={{
            analyticsFeature: 'settings',
            description: 'Choose appearance and feed preferences.',
            destination: 'Settings',
            iconName: 'settings-outline',
            iconTone: 'brand',
            primaryLabel: 'Open Settings',
            subtitle: 'Settings',
            title: 'Personalize your experience',
          }}
          errorMessage={null}
          isSubmitting={false}
          onPrimaryPress={onPrimaryPress}
          primaryTestID="primary-button"
        />,
      );
    });

    expect(renderer.root.findAllByType(Image)).toHaveLength(0);
    expect(renderer.root.findAllByType('VideoView')).toHaveLength(0);
    expect(
      renderer.root.findAll(
        (node: any) =>
          node.type === 'Ionicons' &&
          node.props.name === 'settings-outline' &&
          node.props.color === TEST_THEME.colors.text.brand &&
          node.props.size === 44,
      ),
    ).toHaveLength(1);

    const buttons = renderer.root.findAllByType('Button');
    expect(buttons.map((button: any) => button.props.label)).toEqual(['Open Settings']);
    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBeNull();
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
            media: { posterSource: 1, videoUri: 'https://yummyrecs.com/tutorials/tip-calculator.mp4' },
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

  it('renders poster media without mounting video while inactive', async () => {
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
            media: { posterSource: 1, videoUri: 'https://yummyrecs.com/tutorials/tip-calculator.mp4' },
            primaryLabel: 'Open Tip Calculator',
            subtitle: 'Tip Calculator',
            title: 'Calculate tips quickly',
          }}
          errorMessage={null}
          isMediaActive={false}
          isSubmitting={false}
          layout="immersive"
          onPrimaryPress={onPrimaryPress}
          primaryTestID="primary-button"
        />,
      );
    });

    expect(renderer.root.findByType(Image).props.source).toBe(1);
    expect(renderer.root.findAllByType('VideoView')).toHaveLength(0);
    expect(renderer.root.findAllByType('Button')).toHaveLength(1);
  });

  it('mounts image media with the expected source and resize mode when becoming active', async () => {
    const onPrimaryPress = jest.fn();
    const config = {
      analyticsFeature: 'tip_calculator',
      description: 'Estimate tips quickly.',
      destination: 'TipCalculator' as const,
      iconName: 'calculator-outline' as const,
      iconTone: 'green' as const,
      media: { posterSource: 1, videoUri: 'https://yummyrecs.com/tutorials/tip-calculator.mp4' },
      primaryLabel: 'Open Tip Calculator',
      subtitle: 'Tip Calculator',
      title: 'Calculate tips quickly',
    };
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FeatureIntroScreenContent
          config={config}
          errorMessage={null}
          isMediaActive={false}
          isSubmitting={false}
          layout="immersive"
          mediaPlaybackKey="tipCalculator:replay:profile"
          onPrimaryPress={onPrimaryPress}
          primaryTestID="primary-button"
        />,
      );
    });

    expect(renderer.root.findByType(Image).props.source).toBe(1);
    expect(renderer.root.findAllByType('VideoView')).toHaveLength(0);

    await act(async () => {
      renderer.update(
        <FeatureIntroScreenContent
          config={config}
          errorMessage={null}
          isMediaActive
          isSubmitting={false}
          layout="immersive"
          mediaPlaybackKey="tipCalculator:replay:profile"
          onPrimaryPress={onPrimaryPress}
          primaryTestID="primary-button"
        />,
      );
    });

    const image = renderer.root.findByType(Image);
    expect(image.props.source).toBe(1);
    expect(image.props.resizeMode).toBe('contain');
    expect(renderer.root.findByType('VideoView').props.nativeControls).toBe(false);
    expect(renderer.root.findByType('VideoView').props.contentFit).toBe('contain');
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
            media: { posterSource: 1, videoUri: 'https://yummyrecs.com/tutorials/tip-calculator.mp4' },
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

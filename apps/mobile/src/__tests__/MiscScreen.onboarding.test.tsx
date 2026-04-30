import React from 'react';
import { act, create } from 'react-test-renderer';

import { MiscScreen } from '../screens/MiscScreen';
import { useAuth } from '../providers/AuthProvider';

const mockReact = React;
const mockNavigate = jest.fn();

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('react-native', () => ({
  Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, children),
  ScrollView: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('ScrollView', props, children),
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../components/shared', () => ({
  OptionList: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionList', props, children),
  OptionListRow: (props: Record<string, unknown>) => mockReact.createElement('OptionListRow', props),
  ScreenContentSection: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('ScreenContentSection', props, children),
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
  TabBrandHeader: (props: Record<string, unknown>) => mockReact.createElement('TabBrandHeader', props),
  TabRootScreenScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('TabRootScreenScaffold', props, children),
  TabSectionCard: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('TabSectionCard', props, children),
}));

jest.mock('../features', () => ({
  isMoreOnboardingCardDismissed: jest.fn((state, cardId) => Boolean(state?.moreCards?.[cardId]?.dismissedAt)),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles: (factory: (...args: any[]) => Record<string, unknown>) =>
    (...args: any[]) =>
      factory(
        {
          colors: {
            background: {
              app: 'app',
              muted: 'muted',
              surface: 'surface',
            },
            border: {
              subtle: 'subtle',
              warning: 'warningBorder',
            },
            status: {
              infoBg: 'infoBg',
              warningBg: 'warningBg',
              successBg: 'successBg',
            },
            text: {
              brand: 'brand',
              info: 'info',
              muted: 'muted',
              primary: 'primary',
              secondary: 'secondary',
              success: 'success',
              warning: 'warning',
            },
          },
          radii: {
            md: 8,
          },
          spacing: {
            xxs: 2,
            xs: 4,
            sm: 8,
            md: 12,
            xl: 24,
          },
        },
        ...args,
      ),
  useTheme: () => ({
    colors: {
      background: {
        app: 'app',
        muted: 'muted',
      },
      border: {
        subtle: 'subtle',
        warning: 'warningBorder',
      },
      status: {
        infoBg: 'infoBg',
        successBg: 'successBg',
        warningBg: 'warningBg',
      },
      text: {
        brand: 'brand',
        info: 'info',
        muted: 'muted',
        primary: 'primary',
        secondary: 'secondary',
        success: 'success',
        warning: 'warning',
      },
    },
  }),
}));

jest.mock('../ui', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

async function renderMiscScreen(): Promise<any> {
  let renderer: any;
  await act(async () => {
    renderer = create(
      <MiscScreen
        navigation={
          {
            navigate: mockNavigate,
          } as never
        }
        route={{ key: 'Misc-route', name: 'Misc' } as never}
      />,
    );
  });
  return renderer;
}

function findFeatureRow(renderer: any, testID: string): any {
  return renderer.root.findByProps({ testID });
}

describe('MiscScreen More feature onboarding routing', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user_1',
        mobileOnboardingState: {},
      },
    } as ReturnType<typeof useAuth>);
  });

  it('does not render inline More onboarding cards', async () => {
    const renderer = await renderMiscScreen();

    expect(renderer.root.findAllByProps({ testID: 'more-onboarding-lists-card' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'more-onboarding-split-bill-card' })).toHaveLength(0);
  });

  it.each([
    ['feature-restaurant-lists', 'lists'],
    ['feature-bill-splitter', 'splitBill'],
    ['feature-tip-calculator', 'tipCalculator'],
  ] as const)('routes %s through feature onboarding when not dismissed', async (testID, cardId) => {
    const renderer = await renderMiscScreen();

    await act(async () => {
      findFeatureRow(renderer, testID).props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('MoreFeatureOnboarding', { cardId });
  });

  it.each([
    ['feature-restaurant-lists', 'lists', 'Lists'],
    ['feature-bill-splitter', 'splitBill', 'Bills'],
    ['feature-tip-calculator', 'tipCalculator', 'TipCalculator'],
  ] as const)('routes %s directly when onboarding is dismissed', async (testID, cardId, destination) => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user_1',
        mobileOnboardingState: {
          moreCards: {
            [cardId]: {
              dismissedAt: '2026-04-28T12:00:00.000Z',
            },
          },
        },
      },
    } as ReturnType<typeof useAuth>);
    const renderer = await renderMiscScreen();

    await act(async () => {
      findFeatureRow(renderer, testID).props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith(destination);
  });
});

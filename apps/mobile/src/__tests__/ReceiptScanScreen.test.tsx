import React from 'react';
import { act, create } from 'react-test-renderer';

import { useMonthlyUsage, useReceiptScanFlow } from '../features';
import { ReceiptScanScreen } from '../screens/ReceiptScanScreen';

const mockReact = React;
const mockGoBack = jest.fn();
const mockPopTo = jest.fn();
const mockScanReceipt = jest.fn();
const mockResetReceiptScan = jest.fn();

interface TestRendererNode {
  props: Record<string, unknown>;
}

interface TestRendererWithRoot {
  root: {
    findAllByType: (type: string) => TestRendererNode[];
  };
}

jest.mock('react-native', () => ({
  Animated: {
    Value: jest.fn(() => ({
      interpolate: jest.fn(() => '0deg'),
      setValue: jest.fn(),
    })),
    loop: jest.fn(() => ({
      start: jest.fn(),
      stop: jest.fn(),
    })),
    timing: jest.fn(),
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      mockReact.createElement('AnimatedView', props, children),
  },
  Easing: {
    linear: jest.fn(),
  },
  Linking: {
    openSettings: jest.fn(),
  },
  Platform: {
    OS: 'ios',
  },
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../components/shared', () => ({
  FeatureFormScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureFormScreenScaffold', props, children),
  LinearProgressBar: (props: Record<string, unknown>) =>
    mockReact.createElement('LinearProgressBar', props),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  PhotoSourcePickerCard: (props: Record<string, unknown>) =>
    mockReact.createElement('PhotoSourcePickerCard', props),
  ScanProcessingProgressCard: (props: Record<string, unknown>) =>
    mockReact.createElement('ScanProcessingProgressCard', props),
  useScanProcessingProgress: jest.fn(() => ({
    elapsedLabel: '0s elapsed',
    processingElapsedMs: 0,
    processingPercent: 4,
    processingSpin: '0deg',
    progressValue: 0.04,
  })),
}));

jest.mock('../features', () => ({
  useMonthlyUsage: jest.fn(),
  useReceiptScanFlow: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (theme: Record<string, any>) => Record<string, unknown>) =>
    () =>
      factory({
        colors: {
          background: {
            app: 'app-background',
            muted: 'muted-background',
          },
          border: {
            subtle: 'subtle-border',
          },
          status: {
            infoBg: 'info-background',
            infoBorder: 'info-border',
          },
          text: {
            info: 'info-text',
            success: 'success-text',
          },
        },
        radii: {
          md: 12,
          pill: 999,
        },
        spacing: {
          xs: 8,
          sm: 12,
        },
      }),
  useTheme: jest.fn(() => ({
    colors: {
      text: {
        info: 'info-text',
        success: 'success-text',
      },
    },
  })),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../ui/AppIcon', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

const mockedUseReceiptScanFlow = useReceiptScanFlow as jest.MockedFunction<typeof useReceiptScanFlow>;
const mockedUseMonthlyUsage = useMonthlyUsage as jest.MockedFunction<typeof useMonthlyUsage>;

async function renderScreen() {
  let renderer: TestRendererWithRoot;
  await act(async () => {
    renderer = create(
      <ReceiptScanScreen
        navigation={
          {
            goBack: mockGoBack,
            popTo: mockPopTo,
          } as never
        }
        route={{ params: { returnTo: 'CreateBill' } } as never}
      />,
    ) as unknown as TestRendererWithRoot;
  });

  return renderer!;
}

describe('ReceiptScanScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseReceiptScanFlow.mockReturnValue({
      errorMessage: 'Something went wrong.',
      lastRequestedSource: 'gallery',
      permissionNeedsSettings: false,
      reset: mockResetReceiptScan,
      result: null,
      scanReceipt: mockScanReceipt,
      selectedImageName: '',
      status: 'error',
    });
    mockedUseMonthlyUsage.mockReturnValue({
      isLoading: false,
      snapshot: null,
    } as ReturnType<typeof useMonthlyUsage>);
  });

  it('keeps receipt source actions visible after a generic scan failure', async () => {
    const renderer = await renderScreen();

    expect(
      renderer.root.findAllByType('PageErrorToast').some(
        (toast) => toast.props.errorMessage === 'Something went wrong.',
      ),
    ).toBe(true);
    expect(renderer.root.findAllByType('PhotoSourcePickerCard')).toHaveLength(1);
  });
});

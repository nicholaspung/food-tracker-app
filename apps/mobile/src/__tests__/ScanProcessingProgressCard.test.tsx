import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';

import { ScanProcessingProgressCard } from '../components/shared/ScanProcessingProgressCard';

const mockReact = React;
const mockAnnounceForAccessibility = AccessibilityInfo.announceForAccessibility as jest.Mock;

jest.mock('react-native', () => ({
  AccessibilityInfo: {
    announceForAccessibility: jest.fn(),
  },
  Animated: {
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      mockReact.createElement('AnimatedView', props, children),
  },
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../theme', () => ({
  createThemedStyles: () => () => ({}),
  useTheme: () => ({
    colors: {
      text: {
        info: 'info-text',
      },
    },
  }),
}));

jest.mock('../ui', () => ({
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../ui/AppIcon', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('../components/shared/LinearProgressBar', () => ({
  LinearProgressBar: (props: Record<string, unknown>) =>
    mockReact.createElement('LinearProgressBar', props),
}));

function buildCard(progress: number) {
  return (
    <ScanProcessingProgressCard
      detailText="Reading receipt details."
      elapsedLabel="1s elapsed"
      imageName="IMG_1234.jpg"
      processingPercent={Math.round(progress * 100)}
      progressAccessibilityLabel="Receipt scan progress"
      progressValue={progress}
      spin={'0deg' as never}
      statusText="We're processing your receipt now."
    />
  );
}

describe('ScanProcessingProgressCard', () => {
  beforeEach(() => {
    mockAnnounceForAccessibility.mockReset();
  });

  it('names the shared progress bar for the scan type', async () => {
    let renderer: any;

    await act(async () => {
      renderer = create(buildCard(0.04));
    });

    expect(renderer.root.findByType('LinearProgressBar').props).toEqual(
      expect.objectContaining({
        accessibilityLabel: 'Receipt scan progress',
        progress: 0.04,
      }),
    );
  });

  it('announces only meaningful progress milestones', async () => {
    let renderer: any;

    await act(async () => {
      renderer = create(buildCard(0.04));
    });
    expect(mockAnnounceForAccessibility).toHaveBeenLastCalledWith(
      'Receipt scan progress started.',
    );

    await act(async () => {
      renderer.update(buildCard(0.18));
    });
    expect(mockAnnounceForAccessibility).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.update(buildCard(0.26));
    });
    expect(mockAnnounceForAccessibility).toHaveBeenLastCalledWith(
      'Receipt scan progress, 25% complete.',
    );

    await act(async () => {
      renderer.update(buildCard(0.61));
    });
    expect(mockAnnounceForAccessibility).toHaveBeenLastCalledWith(
      'Receipt scan progress, 50% complete.',
    );

    await act(async () => {
      renderer.update(buildCard(0.79));
    });
    expect(mockAnnounceForAccessibility).toHaveBeenLastCalledWith(
      'Receipt scan progress, 75% complete.',
    );
    expect(mockAnnounceForAccessibility).toHaveBeenCalledTimes(4);
  });
});

import { useEffect } from 'react';
import { act, create } from 'react-test-renderer';

import { useScanProcessingProgress } from '../components/shared/useScanProcessingProgress';

const mockSpinAnimationStart = jest.fn();
const mockSpinAnimationStop = jest.fn();

jest.mock('react-native', () => ({
  Animated: {
    Value: jest.fn(() => ({
      interpolate: jest.fn(() => '0deg'),
      setValue: jest.fn(),
    })),
    loop: jest.fn(() => ({
      start: mockSpinAnimationStart,
      stop: mockSpinAnimationStop,
    })),
    timing: jest.fn(),
  },
  Easing: {
    linear: jest.fn(),
  },
  Platform: {
    OS: 'ios',
  },
}));

type ScanProcessingProgressState = ReturnType<typeof useScanProcessingProgress>;

function ProgressProbe({
  onUpdate,
  status,
}: {
  onUpdate: (state: ScanProcessingProgressState) => void;
  status: string;
}) {
  const state = useScanProcessingProgress(status);

  useEffect(() => {
    onUpdate(state);
  }, [onUpdate, state]);

  return null;
}

describe('useScanProcessingProgress', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSpinAnimationStart.mockClear();
    mockSpinAnimationStop.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts at 4%, advances on the processing cadence, caps at 94%, and completes on success', () => {
    const updates: ScanProcessingProgressState[] = [];
    const onUpdate = (state: ScanProcessingProgressState) => {
      updates.push(state);
    };

    let renderer: any;
    act(() => {
      renderer = create(<ProgressProbe onUpdate={onUpdate} status="idle" />);
    });

    expect(updates.at(-1)?.progressValue).toBe(0);

    act(() => {
      renderer.update(<ProgressProbe onUpdate={onUpdate} status="processing" />);
    });

    expect(updates.at(-1)?.progressValue).toBe(0.04);
    expect(updates.at(-1)?.elapsedLabel).toBe('0s elapsed');
    expect(mockSpinAnimationStart).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(updates.at(-1)?.progressValue).toBe(0.11);
    expect(updates.at(-1)?.processingElapsedMs).toBe(500);

    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    expect(updates.at(-1)?.progressValue).toBe(0.94);
    expect(updates.at(-1)?.processingPercent).toBe(94);

    act(() => {
      renderer.update(<ProgressProbe onUpdate={onUpdate} status="success" />);
    });

    expect(mockSpinAnimationStop).toHaveBeenCalledTimes(1);
    expect(updates.at(-1)?.progressValue).toBe(1);
    expect(updates.at(-1)?.processingElapsedMs).toBe(0);
  });
});

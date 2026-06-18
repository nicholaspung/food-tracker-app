import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform } from 'react-native';

const PROCESSING_PROGRESS_CAP = 0.94;
const PROCESSING_PROGRESS_INTERVAL_MS = 500;
const SHOULD_USE_NATIVE_ANIMATION_DRIVER = Platform.OS !== 'web';

function getNextProcessingProgress(currentValue: number): number {
  if (currentValue < 0.35) {
    return Number(Math.min(0.35, currentValue + 0.07).toFixed(3));
  }

  const remainingProgress = PROCESSING_PROGRESS_CAP - currentValue;
  if (remainingProgress <= 0.004) {
    return PROCESSING_PROGRESS_CAP;
  }

  return Number(
    Math.min(
      PROCESSING_PROGRESS_CAP,
      currentValue + Math.max(0.004, remainingProgress * 0.12),
    ).toFixed(3),
  );
}

function formatElapsedSeconds(elapsedMs: number): string {
  return `${Math.max(0, Math.floor(elapsedMs / 1000))}s elapsed`;
}

export function useScanProcessingProgress(status: string) {
  const [progressValue, setProgressValue] = useState(0);
  const [processingElapsedMs, setProcessingElapsedMs] = useState(0);
  const processingSpinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status === 'processing') {
      setProgressValue(0.04);
      setProcessingElapsedMs(0);
      processingSpinValue.setValue(0);
      const spinAnimation = Animated.loop(
        Animated.timing(processingSpinValue, {
          duration: 1200,
          easing: Easing.linear,
          toValue: 1,
          useNativeDriver: SHOULD_USE_NATIVE_ANIMATION_DRIVER,
        }),
      );
      spinAnimation.start();
      const progressInterval = setInterval(() => {
        setProcessingElapsedMs((currentValue) => currentValue + PROCESSING_PROGRESS_INTERVAL_MS);
        setProgressValue(getNextProcessingProgress);
      }, PROCESSING_PROGRESS_INTERVAL_MS);

      return () => {
        spinAnimation.stop();
        clearInterval(progressInterval);
      };
    }

    if (status === 'success') {
      setProgressValue(1);
      setProcessingElapsedMs(0);
    }

    return undefined;
  }, [processingSpinValue, status]);

  return {
    elapsedLabel: formatElapsedSeconds(processingElapsedMs),
    processingElapsedMs,
    processingPercent: Math.round(progressValue * 100),
    processingSpin: processingSpinValue.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    }),
    progressValue,
  };
}

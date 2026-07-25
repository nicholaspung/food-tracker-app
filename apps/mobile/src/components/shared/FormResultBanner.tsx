import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';

import { Card, Text } from '../../ui';

type FormResultTone = 'success' | 'danger' | 'warning' | 'info';

export interface FormResultBannerProps {
  message: string;
  tone?: FormResultTone;
}

function resolveTextTone(tone: FormResultTone): 'success' | 'danger' | 'warning' | 'info' {
  return tone;
}

export function FormResultBanner({ message, tone = 'success' }: FormResultBannerProps) {
  const lastAnnouncedMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios' || lastAnnouncedMessageRef.current === message) {
      return;
    }

    lastAnnouncedMessageRef.current = message;
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <View
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      accessible
    >
      <Card tone={tone}>
        <Text tone={resolveTextTone(tone)}>{message}</Text>
      </Card>
    </View>
  );
}

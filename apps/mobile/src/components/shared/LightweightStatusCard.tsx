import type { StyleProp, ViewStyle } from 'react-native';

import type { CardTone } from '../../ui';
import { Card, Text, type TextProps } from '../../ui';

export const OFFLINE_USAGE_WARNING_MESSAGE =
  'Offline estimate may be stale. Backend limits are enforced when sync runs.';

interface LightweightStatusCardProps {
  cardTone?: CardTone;
  message: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  textTone?: TextProps['tone'];
}

export function LightweightStatusCard({
  cardTone = 'muted',
  message,
  style,
  testID,
  textTone = 'warning',
}: LightweightStatusCardProps) {
  return (
    <Card style={style} testID={testID} tone={cardTone}>
      <Text tone={textTone}>{message}</Text>
    </Card>
  );
}

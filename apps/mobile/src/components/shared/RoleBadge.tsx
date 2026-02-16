import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { StatusPill } from './StatusPill';

interface RoleBadgeProps {
  label?: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

export function RoleBadge({ label = 'Admin', style, labelStyle }: RoleBadgeProps) {
  return (
    <StatusPill
      label={label}
      labelStyle={labelStyle}
      size="sm"
      style={style}
      tone="info"
      uppercase
      variant="soft"
    />
  );
}

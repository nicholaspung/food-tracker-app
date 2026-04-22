import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { createThemedStyles } from '../../theme';

export interface ScreenContentSectionProps {
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const useStyles = createThemedStyles((theme, fill: boolean) => ({
  container: {
    backgroundColor: theme.colors.background.app,
    ...(fill ? { flex: 1 } : {}),
  },
}));

export function ScreenContentSection({
  children,
  fill = false,
  style,
  testID,
}: PropsWithChildren<ScreenContentSectionProps>) {
  const styles = useStyles(fill);

  return (
    <View style={[styles.container, style]} testID={testID}>
      {children}
    </View>
  );
}

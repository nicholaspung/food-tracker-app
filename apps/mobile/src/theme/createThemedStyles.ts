import { StyleSheet } from 'react-native';
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';

import { useTheme, type Theme } from './ThemeProvider';

type NamedStyles<T> = {
  [Key in keyof T]: ViewStyle | TextStyle | ImageStyle;
};

export function createThemedStyles<TStyles extends NamedStyles<TStyles>, TArgs extends readonly unknown[] = []>(
  createStyles: (theme: Theme, ...args: TArgs) => TStyles,
) {
  return (...args: TArgs) => {
    const theme = useTheme();
    return StyleSheet.create(createStyles(theme, ...args));
  };
}

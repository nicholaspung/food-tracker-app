import { useRef } from 'react';
import { StyleSheet } from 'react-native';
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';

import { useTheme, type Theme } from './ThemeProvider';

type NamedStyles<T> = {
  [Key in keyof T]: ViewStyle | TextStyle | ImageStyle;
};

function areStyleArgsEqual<TArgs extends readonly unknown[]>(left: TArgs, right: TArgs) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => Object.is(value, right[index]));
}

export function createThemedStyles<TStyles extends NamedStyles<TStyles>, TArgs extends readonly unknown[] = []>(
  createStyles: (theme: Theme, ...args: TArgs) => TStyles,
) {
  return (...args: TArgs) => {
    const theme = useTheme();
    const cacheRef = useRef<{
      args: TArgs;
      styles: TStyles;
      theme: Theme;
    } | null>(null);

    if (!cacheRef.current || cacheRef.current.theme !== theme || !areStyleArgsEqual(cacheRef.current.args, args)) {
      cacheRef.current = {
        args,
        styles: StyleSheet.create(createStyles(theme, ...args)),
        theme,
      };
    }

    return cacheRef.current.styles;
  };
}

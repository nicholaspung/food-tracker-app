import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '../theme';

interface ScreenProps {
  edges?: Edge[];
  background?: 'app' | 'surface';
  padded?: boolean;
  scroll?: boolean;
  keyboardAware?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

const DEFAULT_EDGES: Edge[] = ['top', 'bottom'];

export function Screen({
  children,
  edges = DEFAULT_EDGES,
  background = 'app',
  padded = true,
  scroll = false,
  keyboardAware = false,
  style,
  contentStyle,
  testID,
}: PropsWithChildren<ScreenProps>) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: background === 'surface' ? theme.colors.background.surface : theme.colors.background.app,
    },
    keyboardContainer: {
      flex: 1,
    },
    content: {
      paddingHorizontal: padded ? theme.spacing.lg : theme.spacing.none,
      paddingVertical: padded ? theme.spacing.md : theme.spacing.none,
      gap: theme.spacing.md,
    },
    nonScrollContent: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
    },
  });

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.scrollContent, styles.content, contentStyle]}
      style={styles.keyboardContainer}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.nonScrollContent, styles.content, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} style={[styles.safeArea, style]} testID={testID}>
      {keyboardAware ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

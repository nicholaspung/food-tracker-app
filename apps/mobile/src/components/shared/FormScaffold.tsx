import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Text } from '../../ui';

export interface FormScaffoldProps {
  title: string;
  subtitle?: string;
  footer?: ReactNode;
}

export function FormScaffold({ title, subtitle, footer, children }: PropsWithChildren<FormScaffoldProps>) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      gap: theme.spacing.md,
    },
    header: {
      gap: theme.spacing.xs,
    },
    fields: {
      gap: theme.spacing.sm,
    },
    footer: {
      marginTop: theme.spacing.xs,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="titleLg">{title}</Text>
        {subtitle ? <Text tone="secondary">{subtitle}</Text> : null}
      </View>
      <View style={styles.fields}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

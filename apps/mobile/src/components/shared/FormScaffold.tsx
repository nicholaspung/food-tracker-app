import type { PropsWithChildren, ReactNode } from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { createThemedStyles } from '../../theme';
import { Text } from '../../ui';

export interface FormScaffoldProps {
  title: string;
  subtitle?: string;
  lead?: ReactNode;
  showHeader?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}

const useStyles = createThemedStyles((theme) => ({
  container: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: theme.spacing.xl,
  },
  content: {
    width: '100%',
    maxWidth: theme.sizes.modalMaxWidth,
    gap: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
  header: {
    gap: theme.spacing.xs,
  },
  fields: {
    gap: theme.spacing.md,
  },
  footer: {
    marginTop: theme.spacing.sm,
  },
}));

export function FormScaffold({
  title,
  subtitle,
  lead,
  showHeader = true,
  contentStyle,
  footer,
  children,
}: PropsWithChildren<FormScaffoldProps>) {
  const styles = useStyles();

  return (
    <View style={styles.container}>
      <View style={[styles.content, contentStyle]}>
        {lead}
        {showHeader ? (
          <View style={styles.header}>
            <Text variant="titleLg">{title}</Text>
            {subtitle ? <Text tone="secondary">{subtitle}</Text> : null}
          </View>
        ) : null}
        <View style={styles.fields}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </View>
  );
}

import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Button, Card, Text } from '../../ui';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  fill?: boolean;
}

export function EmptyState({ title, description, icon, actionLabel, onAction, fill = false }: EmptyStateProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    cardFill: {
      flex: 1,
    },
    content: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
    },
    contentFill: {
      flex: 1,
    },
    action: {
      width: '100%',
      marginTop: theme.spacing.xs,
    },
  });

  return (
    <Card style={fill ? styles.cardFill : undefined} tone="muted">
      <View style={[styles.content, fill && styles.contentFill]}>
        {icon ? <View>{icon}</View> : null}
        <Text variant="titleMd">{title}</Text>
        {description ? (
          <Text style={{ textAlign: 'center' }} tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={styles.action} /> : null}
    </Card>
  );
}

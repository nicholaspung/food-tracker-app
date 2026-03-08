import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { trackObservabilityEvent } from '../../observability';
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
  const lastShownKeyRef = useRef<string | null>(null);
  const hasAction = Boolean(actionLabel && onAction);
  const shownKey = `${title}::${description ?? ''}::${actionLabel ?? ''}::${fill ? 'fill' : 'inline'}`;

  useEffect(() => {
    if (lastShownKeyRef.current === shownKey) {
      return;
    }

    lastShownKeyRef.current = shownKey;
    trackObservabilityEvent('EMPTY_STATE_SHOWN', {
      hasAction,
      hasDescription: Boolean(description),
      source: 'EmptyState',
      title,
      variant: fill ? 'fill' : 'inline',
    });
  }, [description, fill, hasAction, shownKey, title]);

  const handleActionPress = useCallback(() => {
    if (!actionLabel || !onAction) {
      return;
    }

    trackObservabilityEvent('EMPTY_STATE_ACTION_TAPPED', {
      actionLabel,
      source: 'EmptyState',
      title,
      variant: fill ? 'fill' : 'inline',
    });
    onAction();
  }, [actionLabel, fill, onAction, title]);

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
    description: {
      textAlign: 'center',
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
          <Text style={styles.description} tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={handleActionPress} style={styles.action} /> : null}
    </Card>
  );
}

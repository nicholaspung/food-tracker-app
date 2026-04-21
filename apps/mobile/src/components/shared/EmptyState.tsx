import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';

import { trackObservabilityEvent, type JsonValue } from '../../observability';
import { createThemedStyles } from '../../theme';
import { Button, Card, Text } from '../../ui';
import type { CardProps } from '../../ui';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  fill?: boolean;
  tone?: CardProps['tone'];
  analyticsSource?: string;
  analyticsProps?: Record<string, JsonValue>;
}

const useStyles = createThemedStyles((theme) => ({
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
}));

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  fill = false,
  tone = 'muted',
  analyticsSource,
  analyticsProps,
}: EmptyStateProps) {
  const lastShownKeyRef = useRef<string | null>(null);
  const hasAction = Boolean(actionLabel && onAction);
  const shownKey = `${title}::${description ?? ''}::${actionLabel ?? ''}::${fill ? 'fill' : 'inline'}`;
  const styles = useStyles();

  useEffect(() => {
    if (lastShownKeyRef.current === shownKey) {
      return;
    }

    lastShownKeyRef.current = shownKey;
    trackObservabilityEvent('EMPTY_STATE_SHOWN', {
      ...analyticsProps,
      analyticsSource: analyticsSource ?? null,
      hasAction,
      hasDescription: Boolean(description),
      source: 'EmptyState',
      title,
      variant: fill ? 'fill' : 'inline',
    });
  }, [analyticsProps, analyticsSource, description, fill, hasAction, shownKey, title]);

  const handleActionPress = useCallback(() => {
    if (!actionLabel || !onAction) {
      return;
    }

    trackObservabilityEvent('EMPTY_STATE_ACTION_TAPPED', {
      ...analyticsProps,
      actionLabel,
      analyticsSource: analyticsSource ?? null,
      source: 'EmptyState',
      title,
      variant: fill ? 'fill' : 'inline',
    });
    onAction();
  }, [actionLabel, analyticsProps, analyticsSource, fill, onAction, title]);

  return (
    <Card style={fill ? styles.cardFill : undefined} tone={tone}>
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

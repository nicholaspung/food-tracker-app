import { useCallback, useEffect, useRef, type ReactNode } from 'react';

import { trackObservabilityEvent, type JsonValue } from '../../observability';
import { createThemedStyles } from '../../theme';
import { Button, Card, Text } from '../../ui';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  details?: ReactNode;
  retryLabel?: string;
  onRetry?: () => void;
  analyticsSource?: string;
  analyticsProps?: Record<string, JsonValue>;
}

const useStyles = createThemedStyles((theme) => ({
  retry: {
    marginTop: theme.spacing.xs,
  },
}));

export function ErrorState({
  title = 'Something went wrong',
  description,
  details,
  retryLabel = 'Try again',
  onRetry,
  analyticsSource,
  analyticsProps,
}: ErrorStateProps) {
  const styles = useStyles();
  const lastShownKeyRef = useRef<string | null>(null);
  const shownKey = `${title}::${description ?? ''}::${retryLabel}::${Boolean(onRetry)}`;

  useEffect(() => {
    if (lastShownKeyRef.current === shownKey) {
      return;
    }

    lastShownKeyRef.current = shownKey;
    trackObservabilityEvent('ERROR_STATE_SHOWN', {
      ...analyticsProps,
      analyticsSource: analyticsSource ?? null,
      hasDescription: Boolean(description),
      hasRetry: Boolean(onRetry),
      retryLabel: onRetry ? retryLabel : null,
      source: 'ErrorState',
      title,
    });
  }, [analyticsProps, analyticsSource, description, onRetry, retryLabel, shownKey, title]);

  const handleRetry = useCallback(() => {
    if (!onRetry) {
      return;
    }

    trackObservabilityEvent('ERROR_STATE_ACTION_TAPPED', {
      ...analyticsProps,
      analyticsSource: analyticsSource ?? null,
      retryLabel,
      source: 'ErrorState',
      title,
    });
    onRetry();
  }, [analyticsProps, analyticsSource, onRetry, retryLabel, title]);

  return (
    <Card tone="danger">
      <Text tone="danger" variant="titleMd">
        {title}
      </Text>
      {description ? <Text tone="danger">{description}</Text> : null}
      {details ?? null}
      {onRetry ? <Button label={retryLabel} onPress={handleRetry} style={styles.retry} /> : null}
    </Card>
  );
}

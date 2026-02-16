import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { useTheme } from '../../theme';
import { Button, Card, Text } from '../../ui';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  details?: ReactNode;
  retryLabel?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  details,
  retryLabel = 'Try again',
  onRetry,
}: ErrorStateProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    retry: {
      marginTop: theme.spacing.xs,
    },
  });

  return (
    <Card tone="danger">
      <Text tone="danger" variant="titleMd">
        {title}
      </Text>
      {description ? <Text tone="danger">{description}</Text> : null}
      {details ?? null}
      {onRetry ? <Button label={retryLabel} onPress={onRetry} style={styles.retry} /> : null}
    </Card>
  );
}

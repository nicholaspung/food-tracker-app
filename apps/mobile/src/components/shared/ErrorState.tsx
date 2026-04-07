import type { ReactNode } from 'react';

import { createThemedStyles } from '../../theme';
import { Button, Card, Text } from '../../ui';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  details?: ReactNode;
  retryLabel?: string;
  onRetry?: () => void;
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
}: ErrorStateProps) {
  const styles = useStyles();

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

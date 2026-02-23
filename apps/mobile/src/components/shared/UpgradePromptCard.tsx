import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Button, Card, Text } from '../../ui';

export interface UpgradePromptCardProps {
  title: string;
  description: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  onPrimaryAction: () => void;
  onSecondaryAction?: () => void;
  disabled?: boolean;
}

export function UpgradePromptCard({
  title,
  description,
  primaryActionLabel = 'Subscribe now',
  secondaryActionLabel,
  onPrimaryAction,
  onSecondaryAction,
  disabled = false,
}: UpgradePromptCardProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    card: {
      gap: theme.spacing.sm,
    },
    title: {
      color: theme.colors.text.info,
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 22,
    },
    actions: {
      gap: theme.spacing.xs,
    },
  });

  return (
    <Card style={styles.card} tone="info">
      <View>
        <Text style={styles.title}>{title}</Text>
        <Text tone="secondary">{description}</Text>
      </View>
      <View style={styles.actions}>
        <Button
          disabled={disabled}
          label={primaryActionLabel}
          onPress={onPrimaryAction}
        />
        {secondaryActionLabel && onSecondaryAction ? (
          <Button
            disabled={disabled}
            label={secondaryActionLabel}
            onPress={onSecondaryAction}
            variant="secondary"
          />
        ) : null}
      </View>
    </Card>
  );
}

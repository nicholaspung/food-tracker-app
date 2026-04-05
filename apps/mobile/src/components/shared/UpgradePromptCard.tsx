import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Button, Card, Text } from '../../ui';

export interface UpgradePromptCardProps {
  title: string;
  description: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  onPrimaryAction?: () => void;
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
  const primaryAction = onPrimaryAction
    ? {
        label: primaryActionLabel,
        onPress: onPrimaryAction,
      }
    : null;
  const secondaryAction =
    secondaryActionLabel && onSecondaryAction
      ? {
          label: secondaryActionLabel,
          onPress: onSecondaryAction,
        }
      : null;

  const styles = StyleSheet.create({
    card: {
      gap: theme.spacing.sm,
    },
    title: {
      color: theme.colors.text.info,
    },
    actions: {
      gap: theme.spacing.xs,
    },
  });

  return (
    <Card style={styles.card} tone="info">
      <View>
        <Text style={styles.title} variant="titleSm">{title}</Text>
        <Text tone="secondary" variant="bodyMd">{description}</Text>
      </View>
      {primaryAction || secondaryAction ? (
        <View style={styles.actions}>
          {primaryAction ? (
            <Button
              disabled={disabled}
              label={primaryAction.label}
              onPress={primaryAction.onPress}
            />
          ) : null}
          {secondaryAction ? (
            <Button
              disabled={disabled}
              label={secondaryAction.label}
              onPress={secondaryAction.onPress}
              variant="secondary"
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

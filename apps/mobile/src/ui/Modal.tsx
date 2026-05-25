import { Modal as RNModal, Pressable, StyleSheet, View } from 'react-native';
import type { PropsWithChildren } from 'react';

import { useTheme } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

interface ModalAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export interface ModalProps {
  visible: boolean;
  title?: string;
  description?: string;
  onRequestClose: () => void;
  primaryAction?: ModalAction;
  secondaryAction?: ModalAction;
  testID?: string;
}

export function Modal({
  visible,
  title,
  description,
  onRequestClose,
  primaryAction,
  secondaryAction,
  testID,
  children,
}: PropsWithChildren<ModalProps>) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: theme.colors.background.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.lg,
    },
    card: {
      width: '100%',
      maxWidth: theme.sizes.modalMaxWidth,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.background.surface,
      padding: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    actions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      justifyContent: 'flex-end',
    },
    actionButton: {
      minWidth: 120,
    },
    splitActionButton: {
      flex: 1,
      minWidth: 0,
    },
  });

  const hasTwoActions = Boolean(primaryAction && secondaryAction);

  return (
    <RNModal animationType="fade" onRequestClose={onRequestClose} transparent visible={visible}>
      <Pressable onPress={onRequestClose} style={styles.overlay}>
        <Pressable onPress={() => undefined} style={styles.card} testID={testID}>
          {title ? <Text variant="titleMd">{title}</Text> : null}
          {description ? <Text tone="secondary">{description}</Text> : null}
          {children}
          {primaryAction || secondaryAction ? (
            <View style={styles.actions}>
              {secondaryAction ? (
                <Button
                  accessibilityLabel={secondaryAction.accessibilityLabel}
                  disabled={secondaryAction.disabled}
                  label={secondaryAction.label}
                  onPress={secondaryAction.onPress}
                  style={[styles.actionButton, hasTwoActions ? styles.splitActionButton : null]}
                  testID={secondaryAction.testID}
                  variant="secondary"
                />
              ) : null}
              {primaryAction ? (
                <Button
                  accessibilityLabel={primaryAction.accessibilityLabel}
                  disabled={primaryAction.disabled}
                  label={primaryAction.label}
                  loading={primaryAction.loading}
                  onPress={primaryAction.onPress}
                  style={[styles.actionButton, hasTwoActions ? styles.splitActionButton : null]}
                  testID={primaryAction.testID}
                />
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

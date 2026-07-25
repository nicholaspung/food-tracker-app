import { AccessibilityInfo, Modal as RNModal, Pressable, StyleSheet, View } from 'react-native';
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
  accessibilityLabel?: string;
  title?: string;
  description?: string;
  onRequestClose: () => void;
  primaryAction?: ModalAction;
  secondaryAction?: ModalAction;
  testID?: string;
}

export function Modal({
  visible,
  accessibilityLabel,
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
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.lg,
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: theme.colors.background.overlay,
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
  const resolvedAccessibilityLabel =
    accessibilityLabel?.trim() || title?.trim() || description?.trim() || 'Dialog';

  return (
    <RNModal
      accessibilityLabel={resolvedAccessibilityLabel}
      accessibilityViewIsModal
      animationType="fade"
      onRequestClose={onRequestClose}
      onShow={() => {
        AccessibilityInfo.announceForAccessibility(`Dialog, ${resolvedAccessibilityLabel}`);
      }}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityElementsHidden
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onPress={onRequestClose}
          style={styles.backdrop}
        />
        <View
          accessibilityViewIsModal
          accessible={false}
          importantForAccessibility="no"
          onAccessibilityEscape={onRequestClose}
          onStartShouldSetResponder={() => true}
          style={styles.card}
          testID={testID}
        >
          {title ? (
            <Text accessibilityRole="header" variant="titleMd">
              {title}
            </Text>
          ) : null}
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
        </View>
      </View>
    </RNModal>
  );
}

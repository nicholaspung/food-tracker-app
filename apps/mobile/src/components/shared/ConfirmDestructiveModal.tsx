import { Modal } from '../../ui';

export interface ConfirmDestructiveModalProps {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmLoadingLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
}

export function ConfirmDestructiveModal({
  visible,
  title,
  description,
  confirmLabel,
  confirmLoadingLabel,
  cancelLabel = 'Cancel',
  loading = false,
  disabled = false,
  onConfirm,
  onCancel,
  testID,
}: ConfirmDestructiveModalProps) {
  const isPrimaryDisabled = disabled || loading;
  const cancelButtonTestID = testID ? `${testID}-cancel-button` : undefined;
  const confirmButtonTestID = testID ? `${testID}-confirm-button` : undefined;

  return (
    <Modal
      description={description}
      onRequestClose={onCancel}
      primaryAction={{
        accessibilityLabel: confirmLabel,
        disabled: isPrimaryDisabled,
        label: loading && confirmLoadingLabel ? confirmLoadingLabel : confirmLabel,
        loading,
        onPress: onConfirm,
        testID: confirmButtonTestID,
      }}
      secondaryAction={{
        accessibilityLabel: cancelLabel,
        disabled: loading,
        label: cancelLabel,
        onPress: onCancel,
        testID: cancelButtonTestID,
      }}
      testID={testID}
      title={title}
      visible={visible}
    />
  );
}

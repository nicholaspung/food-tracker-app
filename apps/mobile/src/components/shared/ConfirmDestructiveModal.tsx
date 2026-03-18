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

  return (
    <Modal
      description={description}
      onRequestClose={onCancel}
      primaryAction={{
        disabled: isPrimaryDisabled,
        label: loading && confirmLoadingLabel ? confirmLoadingLabel : confirmLabel,
        loading,
        onPress: onConfirm,
      }}
      secondaryAction={{
        disabled: loading,
        label: cancelLabel,
        onPress: onCancel,
      }}
      testID={testID}
      title={title}
      visible={visible}
    />
  );
}

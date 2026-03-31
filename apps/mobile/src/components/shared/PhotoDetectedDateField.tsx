import type { StyleProp, ViewStyle } from 'react-native';

import { LocalDatePickerField } from './LocalDatePickerField';

interface PhotoDetectedDateFieldProps {
  value: string;
  onChange: (value: string) => void;
  detectedDateValue?: string | null;
  label?: string;
  modalTitle?: string;
  containerStyle?: StyleProp<ViewStyle>;
  maximumDate?: Date;
}

const AUTO_DETECTED_HELPER_TEXT = 'Auto-set from photo date. You can still change it.';

export function PhotoDetectedDateField({
  value,
  onChange,
  detectedDateValue = null,
  label = 'Date',
  modalTitle = 'Select date',
  containerStyle,
  maximumDate,
}: PhotoDetectedDateFieldProps) {
  const isAutoDetected = Boolean(detectedDateValue) && value === detectedDateValue;

  return (
    <LocalDatePickerField
      containerStyle={containerStyle}
      helperText={isAutoDetected ? AUTO_DETECTED_HELPER_TEXT : undefined}
      highlighted={isAutoDetected}
      label={label}
      maximumDate={maximumDate}
      modalTitle={modalTitle}
      onChange={onChange}
      value={value}
    />
  );
}

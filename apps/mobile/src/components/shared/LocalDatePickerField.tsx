import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal as RNModal, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import {
  formatDateToLocalDateString,
  formatLocalDateLabel,
  isValidLocalDate,
} from '../../lib/dateFormatting';
import { createThemedStyles, useTheme } from '../../theme';
import { Button, Card, Input, Text } from '../../ui';

interface LocalDatePickerFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  modalTitle?: string;
  containerStyle?: StyleProp<ViewStyle>;
  maximumDate?: Date;
  fallbackHelperText?: string;
  helperText?: string;
  highlighted?: boolean;
}

const useStyles = createThemedStyles((theme) => ({
  container: {
    gap: theme.spacing.xs,
  },
  datePickerButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
    minHeight: theme.sizes.inputMinHeight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  datePickerButtonHighlighted: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.status.infoBorder,
  },
  datePickerButtonDisabled: {
    opacity: 0.65,
  },
  datePickerButtonLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  datePickerFallbackCard: {
    backgroundColor: theme.colors.status.warningBg,
    borderColor: theme.colors.status.warningBorder,
    borderWidth: 1,
    gap: theme.spacing.xxs,
  },
  datePickerModalOverlay: {
    backgroundColor: theme.colors.background.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  datePickerModalBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  datePickerModalSheet: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  datePickerModalActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  datePickerModalAction: {
    flex: 1,
  },
  helperText: {
    paddingHorizontal: theme.spacing.xxs,
  },
}));

export function LocalDatePickerField({
  label = 'Date',
  value,
  onChange,
  modalTitle = 'Select date',
  containerStyle,
  maximumDate = new Date(),
  fallbackHelperText = 'Use YYYY-MM-DD format.',
  helperText,
  highlighted = false,
}: LocalDatePickerFieldProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date>(() =>
    isValidLocalDate(value) ? new Date(`${value}T00:00:00`) : new Date(),
  );

  const NativeDateTimePicker = useMemo(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = require('@react-native-community/datetimepicker');
      return module?.default ?? null;
    } catch {
      return null;
    }
  }, []);

  const parsedValue = isValidLocalDate(value) ? new Date(`${value}T00:00:00`) : new Date();

  const handleOpenDatePicker = () => {
    if (!NativeDateTimePicker) {
      return;
    }

    setPendingDate(parsedValue);
    setIsDatePickerOpen(true);
  };

  const handleDatePickerChange = (event: { type?: string }, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      if (Platform.OS === 'android') {
        setIsDatePickerOpen(false);
      }
      return;
    }

    if (!selectedDate) {
      return;
    }

    if (Platform.OS === 'ios') {
      setPendingDate(selectedDate);
      return;
    }

    onChange(formatDateToLocalDateString(selectedDate));
    if (Platform.OS === 'android') {
      setIsDatePickerOpen(false);
    }
  };

  const handleCancelDatePicker = () => {
    setIsDatePickerOpen(false);
  };

  const handleConfirmDatePicker = () => {
    onChange(formatDateToLocalDateString(pendingDate));
    setIsDatePickerOpen(false);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <Text variant="label">{label}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={!NativeDateTimePicker}
        onPress={handleOpenDatePicker}
        style={[
          styles.datePickerButton,
          highlighted ? styles.datePickerButtonHighlighted : null,
          !NativeDateTimePicker ? styles.datePickerButtonDisabled : null,
        ]}
      >
        <View style={styles.datePickerButtonLeft}>
          <Ionicons
            color={highlighted ? theme.colors.text.info : theme.colors.text.secondary}
            name="calendar-outline"
            size={16}
          />
          <Text tone={highlighted ? 'info' : 'primary'}>{formatLocalDateLabel(value)}</Text>
        </View>
        <Ionicons
          color={highlighted ? theme.colors.text.info : theme.colors.text.muted}
          name="chevron-down-outline"
          size={14}
        />
      </Pressable>

      {NativeDateTimePicker && helperText ? (
        <Text style={styles.helperText} tone={highlighted ? 'info' : 'muted'} variant="bodySm">
          {helperText}
        </Text>
      ) : null}

      {NativeDateTimePicker ? (
        Platform.OS === 'android' && isDatePickerOpen ? (
          <NativeDateTimePicker
            display="default"
            maximumDate={maximumDate}
            mode="date"
            onChange={handleDatePickerChange}
            value={parsedValue}
          />
        ) : null
      ) : (
        <Card style={styles.datePickerFallbackCard}>
          <Text tone="warning" variant="bodySm">
            Native date picker module is not in this app build.
          </Text>
          <Text tone="warning" variant="bodySm">
            Install `@react-native-community/datetimepicker` and rebuild iOS/Android.
          </Text>
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            helperText={helperText ?? fallbackHelperText}
            onChangeText={onChange}
            placeholder="YYYY-MM-DD"
            value={value}
          />
        </Card>
      )}

      {Platform.OS === 'ios' && NativeDateTimePicker ? (
        <RNModal
          animationType="slide"
          onRequestClose={handleCancelDatePicker}
          transparent
          visible={isDatePickerOpen}
        >
          <View style={styles.datePickerModalOverlay}>
            <Pressable
              accessibilityLabel="Close date picker"
              onPress={handleCancelDatePicker}
              style={styles.datePickerModalBackdrop}
            />
            <View style={styles.datePickerModalSheet}>
              <Text variant="label">{modalTitle}</Text>
              <NativeDateTimePicker
                display="spinner"
                maximumDate={maximumDate}
                mode="date"
                onChange={handleDatePickerChange}
                value={pendingDate}
              />
              <View style={styles.datePickerModalActions}>
                <Button
                  label="Cancel"
                  onPress={handleCancelDatePicker}
                  style={styles.datePickerModalAction}
                  variant="secondary"
                />
                <Button
                  label="Done"
                  onPress={handleConfirmDatePicker}
                  style={styles.datePickerModalAction}
                />
              </View>
            </View>
          </View>
        </RNModal>
      ) : null}
    </View>
  );
}

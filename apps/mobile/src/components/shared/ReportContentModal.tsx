import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { ContentReportReasonCode } from '../../features';
import { useTheme } from '../../theme';
import { Input, Modal, Text } from '../../ui';
import { OptionList, OptionListInlineBody, OptionListRow } from './OptionList';

const REPORT_REASON_OPTIONS: { label: string; value: ContentReportReasonCode }[] = [
  { label: 'Spam', value: 'spam' },
  { label: 'Harassment', value: 'harassment' },
  { label: 'Hateful content', value: 'hate' },
  { label: 'Sexual content', value: 'sexual' },
  { label: 'Violence', value: 'violence' },
  { label: 'Privacy issue', value: 'privacy' },
  { label: 'Other', value: 'other' },
];

export interface ReportContentModalProps {
  visible: boolean;
  contentType: 'visit' | 'quick-track';
  contentLabel: string;
  selectedReasonCode: ContentReportReasonCode | null;
  notes: string;
  isOnline: boolean;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onSubmit: () => void;
  onChangeNotes: (value: string) => void;
  onChangeReasonCode: (value: ContentReportReasonCode) => void;
  testID?: string;
}

export function ReportContentModal({
  visible,
  contentType,
  contentLabel,
  selectedReasonCode,
  notes,
  isOnline,
  isSubmitting = false,
  errorMessage,
  onCancel,
  onSubmit,
  onChangeNotes,
  onChangeReasonCode,
  testID,
}: ReportContentModalProps) {
  const theme = useTheme();
  const [isReasonMenuOpen, setIsReasonMenuOpen] = useState(false);
  const isSubmitDisabled = !isOnline || !selectedReasonCode || isSubmitting;
  const selectedReasonOption = useMemo(
    () => REPORT_REASON_OPTIONS.find((option) => option.value === selectedReasonCode) ?? null,
    [selectedReasonCode],
  );

  useEffect(() => {
    if (!visible) {
      setIsReasonMenuOpen(false);
    }
  }, [visible]);

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.sm,
    },
    helperBlock: {
      backgroundColor: theme.colors.background.muted,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      gap: 2,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    helperLabel: {
      color: theme.colors.text.muted,
      textTransform: 'uppercase',
    },
    helperValue: {
      color: theme.colors.text.primary,
    },
    statusMessage: {},
    selectPlaceholder: {
      color: theme.colors.text.muted,
    },
    reasonMenuBody: {
      padding: theme.spacing.sm,
    },
    reasonMenuScroll: {
      maxHeight: 176,
    },
    reasonMenuScrollContent: {
      gap: theme.spacing.xs,
    },
    reasonOptionButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: theme.spacing.sm,
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    reasonOptionButtonSelected: {
      backgroundColor: theme.colors.status.infoBg,
      borderColor: theme.colors.border.info,
    },
    reasonOptionText: {
      color: theme.colors.text.primary,
      flex: 1,
    },
    reasonOptionTextSelected: {
      color: theme.colors.text.info,
    },
    notesInput: {
      maxHeight: 132,
      minHeight: 92,
      paddingTop: theme.spacing.sm,
      textAlignVertical: 'top',
    },
  });

  const title = contentType === 'visit' ? 'Report Visit' : 'Report Quick Track';

  return (
    <Modal
      description="Select a reason and add optional notes."
      onRequestClose={onCancel}
      primaryAction={{
        accessibilityLabel: 'Submit report',
        disabled: isSubmitDisabled,
        label: isSubmitting ? 'Submitting...' : 'Submit Report',
        loading: isSubmitting,
        onPress: onSubmit,
        testID: testID ? `${testID}-submit-button` : undefined,
      }}
      secondaryAction={{
        accessibilityLabel: 'Cancel',
        disabled: isSubmitting,
        label: 'Cancel',
        onPress: onCancel,
        testID: testID ? `${testID}-cancel-button` : undefined,
      }}
      testID={testID}
      title={title}
      visible={visible}
    >
      <View style={styles.body}>
        <View style={styles.helperBlock}>
          <Text style={styles.helperLabel} variant="label">Reported content</Text>
          <Text style={styles.helperValue} variant="bodySmSemiBold">{contentLabel}</Text>
        </View>

        {!isOnline ? (
          <Text style={styles.statusMessage} tone="warning" variant="bodySm">
            Reporting requires an internet connection.
          </Text>
        ) : null}
        {errorMessage ? (
          <Text style={styles.statusMessage} tone="danger" variant="bodySm">
            {errorMessage}
          </Text>
        ) : null}

        <OptionList>
          <OptionListRow
            accessibilityLabel="Select report reason"
            chevron={isReasonMenuOpen ? 'up' : 'down'}
            onPress={() => {
              setIsReasonMenuOpen((current) => !current);
            }}
            subtitle={selectedReasonOption?.label ?? 'Select an option'}
            subtitleStyle={!selectedReasonOption ? styles.selectPlaceholder : undefined}
            title="Reason"
          />
          {isReasonMenuOpen ? (
            <OptionListInlineBody style={styles.reasonMenuBody}>
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                style={styles.reasonMenuScroll}
                contentContainerStyle={styles.reasonMenuScrollContent}
              >
                {REPORT_REASON_OPTIONS.map((option) => {
                  const isSelected = selectedReasonCode === option.value;

                  return (
                    <Pressable
                      accessibilityLabel={`Report reason ${option.label}`}
                      key={option.value}
                      onPress={() => {
                        onChangeReasonCode(option.value);
                        setIsReasonMenuOpen(false);
                      }}
                      style={[
                        styles.reasonOptionButton,
                        isSelected ? styles.reasonOptionButtonSelected : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.reasonOptionText,
                          isSelected ? styles.reasonOptionTextSelected : null,
                        ]}
                        variant={isSelected ? 'bodyMdBold' : 'bodyMd'}
                      >
                        {option.label}
                      </Text>
                      <Ionicons
                        color={isSelected ? theme.colors.text.info : theme.colors.text.muted}
                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={18}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </OptionListInlineBody>
          ) : null}
        </OptionList>

        <Input
          inputStyle={styles.notesInput}
          label="Notes (optional)"
          multiline
          onChangeText={onChangeNotes}
          placeholder="Add any context that will help the moderation team review this."
          value={notes}
        />
      </View>
    </Modal>
  );
}

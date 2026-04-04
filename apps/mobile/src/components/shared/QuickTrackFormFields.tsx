import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { QuickTrackFormValues } from '../../lib/quickTrackForm';
import { QUICK_TRACK_CATEGORIES } from '../../lib/quickTrackForm';
import { useTheme } from '../../theme';
import { Card, Input, Text } from '../../ui';
import { OptionList, OptionListRow } from './OptionList';
import { PhotoDetectedDateField } from './PhotoDetectedDateField';
import { RatingLegend } from './RatingLegend';
import { RatingSelector } from './RatingSelector';
import { VisibilityOptionSelector } from './VisibilityOptionSelector';

interface QuickTrackFormFieldsProps {
  value: QuickTrackFormValues;
  onChange: (updates: Partial<QuickTrackFormValues>) => void;
  detectedDateValue?: string | null;
  photoSection?: ReactNode;
  isCategoryExpanded: boolean;
  onCategoryExpandedChange: (expanded: boolean) => void;
  ratingLegendInitiallyExpanded?: boolean;
  ratingTestIDPrefix?: string;
}

export function QuickTrackFormFields({
  value,
  onChange,
  detectedDateValue,
  photoSection,
  isCategoryExpanded,
  onCategoryExpandedChange,
  ratingLegendInitiallyExpanded = false,
  ratingTestIDPrefix,
}: QuickTrackFormFieldsProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    sectionCard: {
      gap: theme.spacing.sm,
    },
    photoSection: {
      gap: theme.spacing.sm,
    },
    notesInput: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    categorySelectorRow: {
      backgroundColor: theme.colors.background.muted,
      borderBottomColor: theme.colors.border.default,
    },
    categorySelectorRowExpanded: {
      backgroundColor: theme.colors.status.warningBg,
      borderBottomColor: theme.colors.status.warningBorder,
    },
    categorySelectorTitle: {
      color: theme.colors.text.primary,
      fontWeight: '700',
    },
    categorySelectorSubtitle: {
      color: theme.colors.text.muted,
    },
    categorySelectorSubtitleSelected: {
      color: theme.colors.text.warning,
    },
    categoryOptionSelectedRow: {
      backgroundColor: theme.colors.status.warningBg,
    },
    categoryOptionSelectedLabel: {
      color: theme.colors.text.warning,
    },
    categoryClearLabel: {
      color: theme.colors.text.muted,
    },
    categoryPlaceholder: {
      color: theme.colors.text.muted,
    },
  });

  const selectedCategory = QUICK_TRACK_CATEGORIES.find((category) => category.value === value.category) ?? null;
  const selectedCategoryLabel = selectedCategory?.label ?? 'Select category';

  return (
    <>
      <Card style={styles.sectionCard}>
        <PhotoDetectedDateField
          detectedDateValue={detectedDateValue}
          label="Date"
          modalTitle="Select item date"
          onChange={(nextDate) => {
            onChange({ date: nextDate });
          }}
          value={value.date}
        />
      </Card>

      <Card style={styles.sectionCard}>
        <Text variant="label">Visibility</Text>
        <VisibilityOptionSelector
          onChange={(nextVisibility) => {
            if (nextVisibility === 'friends' || nextVisibility === 'private') {
              onChange({ visibility: nextVisibility });
            }
          }}
          options={['friends', 'private']}
          value={value.visibility}
        />
      </Card>

      <Card style={styles.sectionCard}>
        <Input
          autoCapitalize="words"
          label="Item Name *"
          onChangeText={(nextValue) => {
            onChange({ itemName: nextValue });
          }}
          placeholder="e.g., Chocolate Bar, Coffee, Homemade Pasta"
          value={value.itemName}
        />

        {photoSection ? <View style={styles.photoSection}>{photoSection}</View> : null}
      </Card>

      <RatingLegend initiallyExpanded={ratingLegendInitiallyExpanded} />

      <Card style={styles.sectionCard}>
        <Text variant="label">Rating *</Text>
        <RatingSelector
          onChange={(nextValue) => {
            onChange({ rating: nextValue });
          }}
          testIDPrefix={ratingTestIDPrefix}
          value={value.rating}
        />
      </Card>

      <Card style={styles.sectionCard}>
        <Text variant="label">Category (Optional)</Text>
        <OptionList>
          <OptionListRow
            chevron={isCategoryExpanded ? 'up' : 'down'}
            iconName="pricetag-outline"
            isLast={!isCategoryExpanded}
            onPress={() => {
              onCategoryExpandedChange(!isCategoryExpanded);
            }}
            style={[styles.categorySelectorRow, isCategoryExpanded ? styles.categorySelectorRowExpanded : undefined]}
            subtitle={value.category ? 'Selected category' : 'Tap to choose a category'}
            subtitleStyle={value.category ? styles.categorySelectorSubtitleSelected : styles.categorySelectorSubtitle}
            title={selectedCategoryLabel}
            titleStyle={!value.category ? styles.categoryPlaceholder : styles.categorySelectorTitle}
          />

          {isCategoryExpanded
            ? QUICK_TRACK_CATEGORIES.map((category, index) => {
                const isSelected = value.category === category.value;
                const isLastOption = index === QUICK_TRACK_CATEGORIES.length - 1;

                return (
                  <OptionListRow
                    chevron={false}
                    isLast={isLastOption && !value.category}
                    key={category.value}
                    onPress={() => {
                      onChange({ category: category.value });
                      onCategoryExpandedChange(false);
                    }}
                    rightAccessory={
                      isSelected ? (
                        <Ionicons color={theme.colors.text.warning} name="checkmark-circle" size={16} />
                      ) : undefined
                    }
                    style={isSelected ? styles.categoryOptionSelectedRow : undefined}
                    title={category.label}
                    titleStyle={isSelected ? styles.categoryOptionSelectedLabel : undefined}
                  />
                );
              })
            : null}

          {isCategoryExpanded && value.category ? (
            <OptionListRow
              chevron={false}
              isLast
              onPress={() => {
                onChange({ category: '' });
                onCategoryExpandedChange(false);
              }}
              title="Clear Category"
              titleStyle={styles.categoryClearLabel}
            />
          ) : null}
        </OptionList>

        <Input
          label="Location (Optional)"
          onChangeText={(nextValue) => {
            onChange({ locationText: nextValue });
          }}
          placeholder="e.g., Trader Joe's, Home Kitchen"
          value={value.locationText}
        />

        <Input
          inputStyle={styles.notesInput}
          label="Notes (Optional)"
          multiline
          onChangeText={(nextValue) => {
            onChange({ notes: nextValue });
          }}
          placeholder="Any additional thoughts or details..."
          value={value.notes}
        />
      </Card>
    </>
  );
}

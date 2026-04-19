import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { listFoodProductCategorySuggestions } from '../../features';
import { foodProductsQueryKeys } from '../../features/store/foodProductsQuery';
import type { FoodProductFormValues } from '../../lib/foodProductForm';
import { createThemedStyles } from '../../theme';
import { Card, Input, Text } from '../../ui';
import { FilterChipGroup } from './FilterChipGroup';
import { PhotoDetectedDateField } from './PhotoDetectedDateField';
import { RatingLegend } from './RatingLegend';
import { RatingSelector } from './RatingSelector';
import { VisibilityOptionSelector } from './VisibilityOptionSelector';

interface FoodProductFormFieldsProps {
  value: FoodProductFormValues;
  onChange: (updates: Partial<FoodProductFormValues>) => void;
  detectedDateValue?: string | null;
  photoSection?: ReactNode;
  ratingLegendInitiallyExpanded?: boolean;
  ratingTestIDPrefix?: string;
  isCategoryExpanded?: boolean;
  onCategoryExpandedChange?: (expanded: boolean) => void;
}

const FOOD_PRODUCT_LOCATION_MAX_LENGTH = 200;
const FOOD_PRODUCT_CATEGORY_MAX_LENGTH = 80;

const useStyles = createThemedStyles((theme) => ({
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
  categorySuggestions: {
    gap: theme.spacing.xs,
  },
  categorySuggestionsLabel: {
    color: theme.colors.text.muted,
  },
}));

export function FoodProductFormFields({
  value,
  onChange,
  detectedDateValue,
  photoSection,
  ratingLegendInitiallyExpanded = false,
  ratingTestIDPrefix,
}: FoodProductFormFieldsProps) {
  const styles = useStyles();
  const [isCategoryFocused, setIsCategoryFocused] = useState(false);
  const deferredCategoryQuery = useDeferredValue(value.category.replace(/\s+/g, ' ').trim());
  const normalizedCategoryValue = value.category.replace(/\s+/g, ' ').trim().toLowerCase();

  const categorySuggestionsQuery = useQuery({
    queryKey: foodProductsQueryKeys.categorySuggestions(deferredCategoryQuery),
    queryFn: ({ signal }) =>
      listFoodProductCategorySuggestions(deferredCategoryQuery, {
        limit: 8,
        signal,
      }),
    enabled: isCategoryFocused,
    staleTime: 30_000,
  });

  const visibleSuggestions = useMemo(
    () =>
      (categorySuggestionsQuery.data ?? []).filter(
        (suggestion) => suggestion.normalizedLabel !== normalizedCategoryValue,
      ),
    [categorySuggestionsQuery.data, normalizedCategoryValue],
  );

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
          label="Food Product *"
          onChangeText={(nextValue) => {
            onChange({ itemName: nextValue });
          }}
          placeholder="e.g., Chocolate Bar, Sparkling Water, Strawberries"
          value={value.itemName}
        />

        <Input
          autoCapitalize="words"
          label="Bought At (Optional)"
          maxLength={FOOD_PRODUCT_LOCATION_MAX_LENGTH}
          onChangeText={(nextValue) => {
            onChange({ locationText: nextValue });
          }}
          placeholder="Store, market, neighborhood, or address"
          value={value.locationText}
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
        <Input
          autoCapitalize="words"
          label="Category (Optional)"
          maxLength={FOOD_PRODUCT_CATEGORY_MAX_LENGTH}
          onBlur={() => {
            setIsCategoryFocused(false);
          }}
          onChangeText={(nextValue) => {
            onChange({ category: nextValue });
          }}
          onFocus={() => {
            setIsCategoryFocused(true);
          }}
          placeholder="e.g., Chips, Beverage, Produce"
          value={value.category}
        />
        {isCategoryFocused && visibleSuggestions.length > 0 ? (
          <View style={styles.categorySuggestions}>
            <Text style={styles.categorySuggestionsLabel} variant="bodySm">
              Suggestions from your saved products
            </Text>
            <FilterChipGroup
              onChange={(nextValue) => {
                onChange({ category: nextValue });
              }}
              options={visibleSuggestions.map((suggestion) => ({
                label: suggestion.label,
                value: suggestion.label,
              }))}
              scrollable
              value={value.category}
              wrap={false}
            />
          </View>
        ) : null}
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

export const QuickTrackFormFields = FoodProductFormFields;

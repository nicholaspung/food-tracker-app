import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  EmptyState,
  ErrorState,
  FeatureFormScreenScaffold,
  LocalDatePickerField,
  OptionList,
  OptionListRow,
  PageErrorToast,
  RatingLegend,
  RatingSelector,
  Skeleton,
  VisibilityOptionSelector,
  type VisibilityOptionValue,
} from '../components/shared';
import { getQuickTrackById, resolveDefaultVisitVisibilityFromAuth, updateQuickTrack } from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import {
  formatDateToLocalDateString,
  getTodayLocalDateString,
  isValidLocalDate,
  localDateStringToUTC,
} from '../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Card, Input, Text } from '../ui';

type EditQuickTrackScreenProps = NativeStackScreenProps<RootStackParamList, 'EditQuickTrack'>;
type QuickTrackVisibility = Extract<VisibilityOptionValue, 'private' | 'friends'>;

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  sectionCard: {
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
}));

const ITEM_CATEGORIES = [
  { value: 'convenience_store', label: 'Convenience Store' },
  { value: 'packaged_food', label: 'Packaged Food' },
  { value: 'homemade', label: 'Homemade' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'other', label: 'Other' },
] as const;

type ItemCategory = (typeof ITEM_CATEGORIES)[number]['value'];

function normalizeQuickTrackDate(value: string | undefined): string {
  if (!value) {
    return getTodayLocalDateString();
  }

  const normalizedValue = value.includes(' ') ? value.replace(' ', 'T') : value;
  const parsedDate = new Date(normalizedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return getTodayLocalDateString();
  }

  return formatDateToLocalDateString(parsedDate);
}

function normalizeItemCategory(value: string | undefined): ItemCategory | null {
  const matchingCategory = ITEM_CATEGORIES.find((category) => category.value === value);
  return matchingCategory?.value ?? null;
}

export function EditQuickTrackScreen({ navigation, route }: EditQuickTrackScreenProps) {
  const { quickTrackId } = route.params;
  const theme = useTheme();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();

  const quickTrackQuery = useQuery({
    queryKey: ['feature', 'quickTrack', quickTrackId],
    queryFn: () => getQuickTrackById(quickTrackId),
  });

  const [itemName, setItemName] = useState('');
  const [rating, setRating] = useState(3);
  const [notes, setNotes] = useState('');
  const [itemCategory, setItemCategory] = useState<ItemCategory | null>(null);
  const [visibility, setVisibility] = useState<QuickTrackVisibility>(resolveDefaultVisitVisibilityFromAuth());
  const [itemDate, setItemDate] = useState(getTodayLocalDateString());
  const [isCategoryExpanded, setIsCategoryExpanded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!quickTrackQuery.data) {
      return;
    }

    setItemName(quickTrackQuery.data.itemName);
    setRating(quickTrackQuery.data.rating);
    setNotes(quickTrackQuery.data.notes ?? '');
    setItemCategory(normalizeItemCategory(quickTrackQuery.data.itemCategory));
    setVisibility(quickTrackQuery.data.visibility ?? resolveDefaultVisitVisibilityFromAuth());
    setItemDate(normalizeQuickTrackDate(quickTrackQuery.data.itemDate));
  }, [quickTrackQuery.data]);

  const selectedCategoryLabel = useMemo(() => {
    if (!itemCategory) {
      return 'Select category';
    }

    return ITEM_CATEGORIES.find((category) => category.value === itemCategory)?.label ?? 'Select category';
  }, [itemCategory]);

  const canSubmit = useMemo(() => {
    return itemName.trim().length > 0 && !isSubmitting;
  }, [isSubmitting, itemName]);

  const handleVisibilityChange = (value: VisibilityOptionValue) => {
    if (value === 'private' || value === 'friends') {
      setVisibility(value);
    }
  };

  const handleSave = async () => {
    const trimmedItemName = itemName.trim();
    if (!trimmedItemName) {
      trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_VALIDATION_FAILED', {
        source: 'EditQuickTrackScreen',
        quickTrackId,
        reason: 'missing_item',
      });
      setErrorMessage('Item name is required.');
      return;
    }

    if (!isValidLocalDate(itemDate)) {
      trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_VALIDATION_FAILED', {
        source: 'EditQuickTrackScreen',
        quickTrackId,
        reason: 'invalid_item_date',
      });
      setErrorMessage('Please choose a valid date.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_STARTED', {
      source: 'EditQuickTrackScreen',
      quickTrackId,
      isOnline,
      hasNotes: notes.trim().length > 0,
      visibility,
    });
    setIsSubmitting(true);

    try {
      const quickTrackUpdateInput = {
        itemName: trimmedItemName,
        rating,
        notes,
        itemCategory,
        visibility,
        itemDate: localDateStringToUTC(itemDate),
      };

      if (!isOnline) {
        await queueFeatureOutbox('quick-track.update', {
          quickTrackId,
          updates: quickTrackUpdateInput,
        });

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'quickTrack', quickTrackId] }),
        ]);
        trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_SUCCEEDED', {
          source: 'EditQuickTrackScreen',
          quickTrackId,
          queued: true,
          visibility,
        });
        showQueuedOfflineAlert('Quick track update');
        handleBackPress();
        return;
      }

      await queueWrite('quick-track.update');
      await updateQuickTrack(quickTrackId, quickTrackUpdateInput);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'quickTrack', quickTrackId] }),
      ]);
      trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_SUCCEEDED', {
        source: 'EditQuickTrackScreen',
        quickTrackId,
        queued: false,
        visibility,
      });
      handleBackPress();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update quick track.';
      setErrorMessage(message);
      trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_FAILED', {
        source: 'EditQuickTrackScreen',
        quickTrackId,
        error: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Home');
  };

  if (quickTrackQuery.isLoading) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={handleBackPress}
        primaryAction={{
          label: 'Save Changes',
          disabled: true,
          onPress: () => {},
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: handleBackPress,
        }}
        title="Edit Quick Track"
      >
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton height={20} />
      </FeatureFormScreenScaffold>
    );
  }

  if (quickTrackQuery.isError) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={handleBackPress}
        primaryAction={{
          label: 'Save Changes',
          disabled: true,
          onPress: () => {},
        }}
      secondaryAction={{
          label: 'Cancel',
          onPress: handleBackPress,
        }}
        subtitle="Update the saved details for this quick-track item."
        title="Edit Quick Track"
      >
        <ErrorState
          description="Could not load quick-track item."
          onRetry={() => {
            void quickTrackQuery.refetch();
          }}
          title="Quick track unavailable"
        />
      </FeatureFormScreenScaffold>
    );
  }

  if (!quickTrackQuery.data) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={handleBackPress}
        primaryAction={{
          label: 'Save Changes',
          disabled: true,
          onPress: () => {},
        }}
      secondaryAction={{
          label: 'Cancel',
          onPress: handleBackPress,
        }}
        subtitle="Update the saved details for this quick-track item."
        title="Edit Quick Track"
      >
        <EmptyState
          actionLabel="Back to Home"
          onAction={() => {
            navigation.navigate('Home');
          }}
          title="Quick-track item not found"
        />
      </FeatureFormScreenScaffold>
    );
  }

  return (
    <FeatureFormScreenScaffold
      keyboardAware
      onBackPress={handleBackPress}
      primaryAction={{
        label: 'Save Changes',
        disabled: !canSubmit,
        loading: isSubmitting,
        onPress: () => {
          void handleSave();
        },
      }}
      secondaryAction={{
        label: 'Cancel',
        disabled: isSubmitting,
        onPress: handleBackPress,
      }}
      subtitle="Update the saved details for this quick-track item."
      title="Edit Quick Track"
    >
      <View style={styles.body}>
        <PageErrorToast errorMessage={errorMessage} title="Could not save quick track" />

        <Card style={styles.sectionCard}>
          <LocalDatePickerField
            label="Date"
            modalTitle="Select item date"
            onChange={setItemDate}
            value={itemDate}
          />
        </Card>

        <Card style={styles.sectionCard}>
          <Text variant="label">Visibility</Text>
          <VisibilityOptionSelector
            onChange={handleVisibilityChange}
            options={['friends', 'private']}
            value={visibility}
          />
        </Card>

        <Card style={styles.sectionCard}>
          <Input
            autoCapitalize="words"
            label="Item Name *"
            onChangeText={setItemName}
            placeholder="e.g., Chocolate Bar, Coffee, Homemade Pasta"
            value={itemName}
          />
        </Card>

        <RatingLegend initiallyExpanded={false} />

        <Card style={styles.sectionCard}>
          <Text variant="label">Rating *</Text>
          <RatingSelector
            onChange={setRating}
            value={rating}
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
                setIsCategoryExpanded((currentValue) => !currentValue);
              }}
              style={[styles.categorySelectorRow, isCategoryExpanded ? styles.categorySelectorRowExpanded : undefined]}
              subtitle={itemCategory ? 'Selected category' : 'Tap to choose a category'}
              subtitleStyle={itemCategory ? styles.categorySelectorSubtitleSelected : styles.categorySelectorSubtitle}
              title={selectedCategoryLabel}
              titleStyle={!itemCategory ? styles.categoryPlaceholder : undefined}
            />

            {isCategoryExpanded ? (
              ITEM_CATEGORIES.map((category, index) => {
                const isSelected = itemCategory === category.value;
                const isLastOption = index === ITEM_CATEGORIES.length - 1;

                return (
                  <OptionListRow
                    chevron={false}
                    isLast={isLastOption && !itemCategory}
                    key={category.value}
                    onPress={() => {
                      setItemCategory(category.value);
                      setIsCategoryExpanded(false);
                    }}
                    rightAccessory={
                      isSelected ? <Ionicons color={theme.colors.text.warning} name="checkmark-circle" size={16} /> : undefined
                    }
                    style={isSelected ? styles.categoryOptionSelectedRow : undefined}
                    title={category.label}
                    titleStyle={isSelected ? styles.categoryOptionSelectedLabel : undefined}
                  />
                );
              })
            ) : null}
            {isCategoryExpanded && itemCategory ? (
              <OptionListRow
                chevron={false}
                isLast
                onPress={() => {
                  setItemCategory(null);
                  setIsCategoryExpanded(false);
                }}
                title="Clear Category"
                titleStyle={styles.categoryClearLabel}
              />
            ) : null}
          </OptionList>

          <Input
            inputStyle={styles.notesInput}
            label="Notes (Optional)"
            multiline
            onChangeText={setNotes}
            placeholder="Any additional thoughts or details..."
            value={notes}
          />
        </Card>
      </View>
    </FeatureFormScreenScaffold>
  );
}
